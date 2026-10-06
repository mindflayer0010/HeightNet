from __future__ import annotations

import json
from pathlib import Path
import shutil
import threading
import time
import zipfile
from urllib.request import Request, urlopen
from urllib.parse import quote

import numpy as np
import rasterio
from rasterio.transform import from_origin

import backend.api.server as server_module
from backend.api.server import create_server


def _write_test_raster(path: Path, values: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=values.shape[0],
        width=values.shape[1],
        count=1,
        dtype="float32",
        crs="EPSG:32643",
        transform=from_origin(500000, 4000000, 10, 10),
        nodata=-9999,
    ) as dataset:
        dataset.write(values.astype("float32"), 1)


def _write_test_rgb_raster(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    base = np.arange(16, dtype="uint16").reshape(4, 4) + 100
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=4,
        width=4,
        count=3,
        dtype="uint16",
        crs="EPSG:32643",
        transform=from_origin(500000, 4000000, 10, 10),
        nodata=0,
    ) as dataset:
        dataset.write(base, 1)
        dataset.write(base + 20, 2)
        dataset.write(base + 40, 3)


def test_portal_serves_health_and_viewer() -> None:
    server = create_server(port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base_url = f"http://127.0.0.1:{server.server_address[1]}"

        with urlopen(f"{base_url}/api/health", timeout=5) as response:
            health = json.loads(response.read().decode("utf-8"))
        assert health["status"] == "ok"

        with urlopen(f"{base_url}/", timeout=5) as response:
            workspace_html = response.read().decode("utf-8")
        assert response.status == 200
        assert "HeightNet" in workspace_html
        assert "/workspace/assets/" in workspace_html

        with urlopen(f"{base_url}/classic/", timeout=5) as response:
            classic_html = response.read().decode("utf-8")
        assert response.status == 200
        assert "/workspace/assets/" in classic_html

        with urlopen(f"{base_url}/landing/", timeout=5) as response:
            landing_html = response.read().decode("utf-8")
        assert response.status == 200
        assert "/workspace/assets/" in landing_html

        with urlopen(f"{base_url}/viewer/3d", timeout=5) as response:
            dedicated_html = response.read().decode("utf-8")
        assert response.status == 200
        assert "/workspace/assets/" in dedicated_html

        with urlopen(f"{base_url}/viewer/", timeout=5) as response:
            viewer_html = response.read().decode("utf-8")
        assert response.status == 200
        assert "Terrain Viewer" in viewer_html

        with urlopen(f"{base_url}/globe/", timeout=5) as response:
            globe_html = response.read().decode("utf-8")
        assert response.status == 200
        assert response.geturl().endswith("/?view=map")
        assert "/workspace/assets/" in globe_html
        assert "HeightNet" in globe_html
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_imagery_compatibility_route_returns_downloadable_artifact(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(server_module, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(server_module, "JOBS_ROOT", tmp_path / "jobs")
    source = tmp_path / "source_rgb.tif"
    _write_test_rgb_raster(source)

    monkeypatch.setattr(
        server_module,
        "search_sentinel2_scenes",
        lambda bbox, max_cloud, limit: [
            {
                "scene_id": "demo-scene",
                "feature": {"properties": {"datetime": "2026-01-01T00:00:00Z", "eo:cloud_cover": 1.0}},
            }
        ],
    )

    def fake_download(scene, output_path, bbox):
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, output_path)
        return output_path

    def fake_visual(scene, output_path, bbox):
        raise server_module.AcquisitionError("visual asset not available in test")

    monkeypatch.setattr(server_module, "download_scene_rgb", fake_download)
    monkeypatch.setattr(server_module, "download_scene_visual", fake_visual)

    server = create_server(port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base_url = f"http://127.0.0.1:{server.server_address[1]}"
        request = Request(
            f"{base_url}/api/imagery",
            data=json.dumps({"bbox": [77.0, 28.0, 77.1, 28.1], "format": "geotiff"}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
        assert payload["success"] is True
        assert payload["source"]["scene_id"] == "demo-scene"
        assert payload["download_url"].startswith("/api/file?path=jobs/")
        artifact = tmp_path / "jobs" / payload["artifact_id"] / "sentinel2_rgb.tif"
        assert artifact.is_file()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_upload_route_stores_and_inspects_raster(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(server_module, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(server_module, "JOBS_ROOT", tmp_path / "jobs")
    source_path = tmp_path / "source_rgb.tif"
    _write_test_rgb_raster(source_path)
    source = source_path.read_bytes()

    server = create_server(port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base_url = f"http://127.0.0.1:{server.server_address[1]}"
        request = Request(
            f"{base_url}/api/upload",
            data=source,
            headers={
                "Content-Type": "application/octet-stream",
                "Content-Length": str(len(source)),
                "X-Filename": "uploaded_demo.tif",
            },
            method="POST",
        )
        with urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
        assert payload["filename"] == "uploaded_demo.tif"
        assert payload["input"]["kind"] == "georeferenced"
        assert payload["input"]["crs"]
        assert (tmp_path / payload["path"]).is_file()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_reference_upload_route_accepts_raster_and_gcp_csv(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(server_module, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(server_module, "JOBS_ROOT", tmp_path / "jobs")
    reference = tmp_path / "reference.tif"
    _write_test_raster(reference, np.ones((3, 3), dtype=float))

    server = create_server(port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base_url = f"http://127.0.0.1:{server.server_address[1]}"
        raster_request = Request(
            f"{base_url}/api/upload-reference",
            data=reference.read_bytes(),
            headers={
                "Content-Type": "application/octet-stream",
                "Content-Length": str(reference.stat().st_size),
                "X-Filename": "reference.tif",
            },
            method="POST",
        )
        with urlopen(raster_request, timeout=10) as response:
            raster_payload = json.loads(response.read().decode("utf-8"))
        assert raster_payload["reference"]["kind"] == "reference_raster"
        assert (tmp_path / raster_payload["path"]).is_file()

        gcp_bytes = b"x,y,reference_m\n500005,3999995,120.0\n"
        gcp_request = Request(
            f"{base_url}/api/upload-reference",
            data=gcp_bytes,
            headers={
                "Content-Type": "text/csv",
                "Content-Length": str(len(gcp_bytes)),
                "X-Filename": "survey.csv",
            },
            method="POST",
        )
        with urlopen(gcp_request, timeout=10) as response:
            gcp_payload = json.loads(response.read().decode("utf-8"))
        assert gcp_payload["reference"]["kind"] == "gcp_csv"
        assert (tmp_path / gcp_payload["path"]).read_text(encoding="utf-8") == gcp_bytes.decode()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_raster_inspection_and_reference_evaluation_routes(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(server_module, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(server_module, "JOBS_ROOT", tmp_path / "jobs")
    prediction = tmp_path / "data" / "prediction.tif"
    reference = tmp_path / "data" / "reference.tif"
    _write_test_raster(prediction, np.array([[10, 12, 14], [20, 22, 24], [30, 32, 34]], dtype=float))
    _write_test_raster(reference, np.array([[11, 13, 15], [21, 23, 25], [31, 33, 35]], dtype=float))

    server = create_server(port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base_url = f"http://127.0.0.1:{server.server_address[1]}"
        prediction_path = "data/prediction.tif"
        stats_url = f"{base_url}/api/raster-stats?path={quote(prediction_path)}"
        with urlopen(stats_url, timeout=5) as response:
            stats = json.loads(response.read().decode("utf-8"))
        assert stats["shape"] == [3, 3]
        assert stats["median"] == 22.0

        preview_url = f"{base_url}/api/raster-preview?path={quote(prediction_path)}&palette=elevation"
        with urlopen(preview_url, timeout=5) as response:
            preview = response.read()
            assert response.headers["Content-Type"] == "image/png"
        assert preview.startswith(b"\x89PNG")

        inspect_url = f"{base_url}/api/inspect?path={quote(prediction_path)}&x=1&y=1"
        with urlopen(inspect_url, timeout=5) as response:
            point = json.loads(response.read().decode("utf-8"))
        assert point["value_m"] == 22.0
        assert point["slope_degrees"] is not None
        assert point["crs"] == "EPSG:32643"

        profile_url = (
            f"{base_url}/api/profile?path={quote(prediction_path)}"
            "&start_x=0&start_y=0&end_x=2&end_y=2&samples=5"
        )
        with urlopen(profile_url, timeout=5) as response:
            profile = json.loads(response.read().decode("utf-8"))
        assert profile["distance_m"] > 0
        assert len(profile["samples"]) == 5
        assert profile["min_m"] == 10.0
        assert profile["max_m"] == 34.0

        export_source = tmp_path / "jobs" / "result.tif"
        export_source.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(prediction, export_source)
        export_request = Request(
            f"{base_url}/api/export-bundle",
            data=json.dumps({"files": [{"path": "jobs/result.tif", "name": "estimated-dsm.tif"}]}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(export_request, timeout=5) as response:
            bundle = json.loads(response.read().decode("utf-8"))
        assert bundle["files"] == ["estimated-dsm.tif"]
        bundle_path = tmp_path / bundle["path"]
        assert bundle_path.is_file()
        with zipfile.ZipFile(bundle_path) as archive:
            assert archive.namelist() == ["estimated-dsm.tif"]

        request = Request(
            f"{base_url}/api/evaluate",
            data=json.dumps(
                {
                    "prediction_path": prediction_path,
                    "reference_path": "data/reference.tif",
                }
            ).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=5) as response:
            started = json.loads(response.read().decode("utf-8"))
        assert started["status"] in {"queued", "running", "complete"}

        for _ in range(20):
            with urlopen(f"{base_url}/api/jobs/{started['id']}", timeout=5) as response:
                job = json.loads(response.read().decode("utf-8"))
            if job["status"] in {"complete", "failed"}:
                break
            time.sleep(0.05)
        assert job["status"] == "complete"
        assert job["result"]["raster_metrics"]["mae_m"] == 1.0
        assert (tmp_path / job["result"]["report_path"]).is_file()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_reference_availability_route_reports_source_roles(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(server_module, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(server_module, "JOBS_ROOT", tmp_path / "jobs")
    gcp_dir = tmp_path / "data" / "gcps"
    gcp_dir.mkdir(parents=True)
    (gcp_dir / "survey.csv").write_text("x,y,reference_m\n1,2,100\n", encoding="utf-8")

    server = create_server(port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base_url = f"http://127.0.0.1:{server.server_address[1]}"
        url = (
            f"{base_url}/api/reference-availability"
            "?bbox=77.1,30.1,77.2,30.2&remote=0"
        )
        with urlopen(url, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))

        assert payload["bbox"] == [77.1, 30.1, 77.2, 30.2]
        assert payload["summary"]["gcp_upload_supported"] is True
        assert any(source["role"] == "coarse_ground" for source in payload["sources"])
        assert any(source["role"] == "calibration_reference" for source in payload["sources"])
        assert payload["rules"]["reference_not_used_as_prediction_input_by_default"] is True
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_open_qgis_route_writes_a_layered_project(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(server_module, "REPO_ROOT", tmp_path)
    monkeypatch.setattr(server_module, "JOBS_ROOT", tmp_path / "jobs")
    rgb = tmp_path / "jobs" / "rgb.tif"
    dsm = tmp_path / "jobs" / "dsm.tif"
    _write_test_raster(rgb, np.ones((3, 3), dtype=float))
    _write_test_raster(dsm, np.full((3, 3), 12.0, dtype=float))
    monkeypatch.setattr(server_module, "open_qgis_project", lambda path: (False, "QGIS project created."))

    server = create_server(port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base_url = f"http://127.0.0.1:{server.server_address[1]}"
        request = Request(
            f"{base_url}/api/open-qgis",
            data=json.dumps(
                {
                    "layers": [
                        {"path": "jobs/rgb.tif", "label": "RGB input", "visible": True, "opacity": 1},
                        {"path": "jobs/dsm.tif", "label": "Estimated DSM", "visible": False, "opacity": 0.55},
                    ]
                }
            ).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=5) as response:
            payload = json.loads(response.read().decode("utf-8"))
        assert payload["qgis_launched"] is False
        assert payload["project_path"].endswith("heightnet_analysis.qgs")
        project = tmp_path / payload["project_path"]
        text = project.read_text(encoding="utf-8")
        assert "RGB input" in text
        assert "Estimated DSM" in text
        assert "dsm.tif" in text
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
