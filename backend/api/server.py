"""Local HeightNet portal server.

This is intentionally a small single-machine server for the project demo. It
serves the portal, proxies place/scene search, downloads selected RGB data,
and starts the existing command-line pipeline as a background job.
"""

from __future__ import annotations

import json
from io import BytesIO
import math
import mimetypes
from pathlib import Path
import subprocess
import sys
import uuid
import zipfile
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from backend.acquisition.stac import (
    AcquisitionError,
    download_scene_rgb,
    download_scene_visual,
    geocode_place,
    search_sentinel2_scenes,
    validate_bbox,
)
from backend.acquisition.sources import discover_sources
from backend.acquisition.manifest import build_source_manifest
from backend.geo.dem import fetch_nasadem_for_raster
from backend.geo.qgis_project import open_qgis_project, prepare_qgis_project
from backend.geo.raster import write_single_band_geotiff
from backend.inspection import inspect_raster, profile_raster, raster_stats
from backend.jobs.store import JobStore
from backend.pipeline import describe_input
from backend.evaluation.reference import (
    compute_metrics,
    evaluate_gcp_calibration,
    load_aligned_reference,
    read_gcp_csv,
)
from scripts.summarize_evaluation import _metric_rows


REPO_ROOT = Path(__file__).resolve().parents[2]
PORTAL_ROOT = REPO_ROOT / "portal"
JOBS_ROOT = REPO_ROOT / "data" / "portal_jobs"
VIEWER_ROOT = REPO_ROOT / "viewer"
WORKSPACE_ROOT = REPO_ROOT / "portal" / "workspace-src" / "dist"
MAX_UPLOAD_BYTES = 500 * 1024 * 1024
JOB_STORE = JobStore()
MIN_SENTINEL_VALID_FRACTION = 0.80


def _relative(path: Path) -> str:
    return path.resolve().relative_to(REPO_ROOT.resolve()).as_posix()


def _repo_path(value: str) -> Path:
    candidate = (REPO_ROOT / value).resolve()
    try:
        candidate.relative_to(REPO_ROOT.resolve())
    except ValueError as exc:
        raise ValueError("Paths must stay inside the project folder.") from exc
    return candidate


def _raster_bbox_wgs84(path: Path) -> tuple[float, float, float, float] | None:
    """Return a GeoTIFF extent in WGS84 for source discovery and provenance."""

    try:
        import rasterio
        from rasterio.warp import transform_bounds

        with rasterio.open(path) as dataset:
            if dataset.crs is None:
                return None
            bounds = transform_bounds(
                dataset.crs,
                "EPSG:4326",
                *dataset.bounds,
                densify_pts=21,
            )
        return tuple(float(value) for value in bounds)
    except (ImportError, OSError, ValueError):
        return None


def _rgb_valid_fraction(path: Path) -> float:
    """Estimate how much of an RGB raster contains real pixels.

    Sentinel scenes can intersect an AOI while only partially covering it. The
    missing part is commonly encoded as zeroes, which would otherwise become
    a large black patch in the 3D texture.
    """

    try:
        import numpy as np
        import rasterio

        with rasterio.open(path) as dataset:
            if dataset.count < 3:
                return 0.0
            height = min(dataset.height, 512)
            width = min(dataset.width, 512)
            bands = dataset.read(
                (1, 2, 3),
                out_shape=(3, height, width),
                masked=True,
            ).astype("float32")
        values = np.ma.filled(bands, np.nan)
        valid = np.all(np.isfinite(values), axis=0) & np.any(values != 0, axis=0)
        return float(valid.mean())
    except (ImportError, OSError, ValueError):
        return 0.0


def _json_bytes(payload: object) -> bytes:
    return (json.dumps(payload, indent=2, default=str) + "\n").encode("utf-8")


def _run_pipeline_job(job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    JOB_STORE.update(job_id, message="Checking the image and loading the HeightNet model...")
    input_path = _repo_path(str(payload["input_path"]))
    if not input_path.is_file():
        raise ValueError(f"Input file does not exist: {input_path}")

    job_dir = JOBS_ROOT / job_id
    output_dir = job_dir / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)
    prefix = str(payload.get("output_prefix") or input_path.stem)
    checkpoint = _repo_path(
        str(
            payload.get(
                "checkpoint",
                "data/gamus_raw/checkpoints/depth_anything_v2_gamus_fulltrain_epoch3_stable.pt",
            )
        )
    )
    if not checkpoint.is_file():
        raise ValueError(
            "Model checkpoint is missing. Put it in data/gamus_raw/checkpoints or "
            "send a checkpoint path in the request."
        )

    description = describe_input(input_path)
    JOB_STORE.update(job_id, message="Reading image metadata and preparing the elevation source...")
    source_bbox = _raster_bbox_wgs84(input_path) if description.kind.value == "georeferenced" else None
    source_availability: dict[str, Any] | None = None
    if source_bbox is not None:
        try:
            source_availability = discover_sources(REPO_ROOT, source_bbox)
        except Exception as exc:
            # Catalog discovery is helpful context, not a reason to block a
            # valid inference run. The selected coarse DEM still works.
            source_availability = {
                "bbox": list(source_bbox),
                "sources": [],
                "summary": {"reference_available": False, "gcp_upload_supported": True},
                "discovery_warning": str(exc),
            }
    ground_path: Path | None = None
    ground_source: dict[str, Any] | None = None
    supplied_ground = payload.get("ground")
    if supplied_ground:
        ground_path = _repo_path(str(supplied_ground))
        ground_source = {
            "id": "selected:user-ground",
            "name": ground_path.name,
            "role": "coarse_ground",
            "status": "selected",
            "access": "user_supplied",
            "provider": "User supplied",
        }
    elif description.kind.value == "georeferenced":
        JOB_STORE.update(job_id, message="Fetching a co-registered coarse ground elevation layer...")
        ground_path = job_dir / "nasadem_ground.tif"
        ground = fetch_nasadem_for_raster(input_path)
        write_single_band_geotiff(
            input_path,
            ground_path,
            ground.elevation,
            description="HeightNet NASADEM ground elevation proxy (metres)",
        )
        ground_source = {
            "id": "global:nasadem",
            "name": "NASADEM via Microsoft Planetary Computer",
            "role": "coarse_ground",
            "status": "selected",
            "access": "stac",
            "provider": "Microsoft Planetary Computer",
            "resolution_m": 30.0,
        }

    command = [
        sys.executable,
        str(REPO_ROOT / "scripts" / "run_pipeline.py"),
        "--input",
        str(input_path),
        "--checkpoint",
        str(checkpoint),
        "--output-dir",
        str(output_dir),
        "--output-prefix",
        prefix,
    ]
    calibration_report = payload.get("calibration_report")
    sure_report = payload.get(
        "sure_calibration_report",
        "reports/sure_cal_256res_calibration.json",
    )
    semantic_checkpoint = payload.get(
        "semantic_checkpoint",
        "data/gamus_raw/checkpoints/gamus_semantic_head_fulltrain_epoch1.pt",
    )
    if calibration_report:
        command.extend(["--calibration-report", str(_repo_path(str(calibration_report)))])
    elif sure_report and _repo_path(str(sure_report)).is_file():
        command.extend(["--sure-calibration-report", str(_repo_path(str(sure_report)))])
        if semantic_checkpoint and _repo_path(str(semantic_checkpoint)).is_file():
            command.extend(["--semantic-checkpoint", str(_repo_path(str(semantic_checkpoint)))])
    if ground_path is not None:
        command.extend(["--ground", str(ground_path)])

    JOB_STORE.update(job_id, message="Predicting relative depth and calibrating above-ground height...")
    completed = subprocess.run(
        command,
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=60 * 60,
        check=False,
    )
    combined = (completed.stdout + "\n" + completed.stderr).strip()
    if completed.returncode != 0:
        raise RuntimeError(combined[-5000:] or "Pipeline failed without output.")

    outputs: dict[str, Any] = {
        "log": combined,
        "input": _relative(input_path),
        "relative": _relative(output_dir / f"{prefix}_relative_depth.tif")
        if description.kind.value == "georeferenced"
        else _relative(output_dir / f"{prefix}_relative_dsm.tif"),
        "metadata": _relative(output_dir / f"{prefix}_pipeline_metadata.json"),
    }
    agl = output_dir / f"{prefix}_predicted_agl.tif"
    dsm = output_dir / f"{prefix}_estimated_dsm.tif"
    uncertainty = output_dir / f"{prefix}_calibration_uncertainty.tif"
    confidence = output_dir / f"{prefix}_calibration_confidence.tif"
    scene_risk = output_dir / f"{prefix}_scene_risk.tif"
    scene_quality = output_dir / f"{prefix}_scene_quality.json"
    if agl.is_file():
        outputs["agl"] = _relative(agl)
    if dsm.is_file():
        outputs["dsm"] = _relative(dsm)
    if uncertainty.is_file():
        outputs["uncertainty"] = _relative(uncertainty)
    if confidence.is_file():
        outputs["confidence"] = _relative(confidence)
    if scene_risk.is_file():
        outputs["scene_risk"] = _relative(scene_risk)
    if scene_quality.is_file():
        outputs["scene_quality"] = _relative(scene_quality)
    stats: dict[str, Any] = {}
    for name, path in (("agl", agl), ("dsm", dsm), ("confidence", confidence), ("scene_risk", scene_risk)):
        if path.is_file():
            stats[name] = raster_stats(path)
    if stats:
        outputs["stats"] = stats

    source_manifest = build_source_manifest(
        input_path=_relative(input_path),
        input_kind=description.kind.value,
        ground_path=_relative(ground_path) if ground_path is not None else None,
        ground_source=ground_source,
        availability=source_availability,
        bbox=source_bbox,
    )
    if source_availability and source_availability.get("discovery_warning"):
        source_manifest["discovery_warning"] = source_availability["discovery_warning"]
    source_manifest_path = output_dir / f"{prefix}_source_manifest.json"
    source_manifest_path.write_text(
        json.dumps(source_manifest, indent=2, default=str) + "\n",
        encoding="utf-8",
    )
    outputs["source_manifest"] = _relative(source_manifest_path)
    pipeline_metadata_path = output_dir / f"{prefix}_pipeline_metadata.json"
    if pipeline_metadata_path.is_file():
        try:
            pipeline_metadata = json.loads(pipeline_metadata_path.read_text(encoding="utf-8"))
            pipeline_metadata["source_manifest"] = source_manifest
            pipeline_metadata_path.write_text(
                json.dumps(pipeline_metadata, indent=2, default=str) + "\n",
                encoding="utf-8",
            )
        except (OSError, json.JSONDecodeError):
            pass
    JOB_STORE.update(job_id, message="Elevation layers are ready. Building the textured 3D terrain...")
    elevation = output_dir / f"{prefix}_estimated_dsm.tif"
    if not elevation.is_file():
        elevation = output_dir / f"{prefix}_relative_dsm.tif"
    if elevation.is_file():
        mesh = output_dir / f"{prefix}_terrain.obj"
        mesh_rgb = input_path
        supplied_texture = payload.get("texture_path")
        if supplied_texture:
            candidate_texture = _repo_path(str(supplied_texture))
            if candidate_texture.is_file():
                mesh_rgb = candidate_texture
        # Keep browser jobs responsive. The downloaded raster can be much
        # larger than a useful interactive mesh, so choose a stride that keeps
        # the terrain near 180k vertices while preserving small demos at the
        # existing stride of 8.
        pixel_count = max(description.width * description.height, 1)
        mesh_stride = max(8, int(math.ceil(math.sqrt(pixel_count / 180_000))))
        mesh_command = [
            sys.executable,
            str(REPO_ROOT / "scripts" / "export_terrain_mesh.py"),
            "--rgb",
            str(mesh_rgb),
            "--elevation",
            str(elevation),
            "--output",
            str(mesh),
            "--stride",
            str(mesh_stride),
            "--vertical-exaggeration",
            "1.0",
        ]
        mesh_result = subprocess.run(
            mesh_command,
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=60 * 30,
            check=False,
        )
        if mesh_result.returncode == 0 and mesh.is_file():
            outputs["mesh"] = _relative(mesh)
            material = mesh.with_suffix(".mtl")
            texture = mesh.with_name(f"{mesh.stem}_texture.png")
            mesh_metadata = mesh.with_name(f"{mesh.stem}_metadata.json")
            if material.is_file():
                outputs["material"] = _relative(material)
            if texture.is_file():
                outputs["texture"] = _relative(texture)
            if mesh_metadata.is_file():
                outputs["mesh_metadata"] = _relative(mesh_metadata)
            outputs["mesh_log"] = mesh_result.stdout[-2000:]
            outputs["mesh_rgb"] = _relative(mesh_rgb)
            outputs["mesh_stride"] = mesh_stride
            JOB_STORE.update(job_id, message="Terrain mesh and exports are ready. Opening the 3D view...")
        else:
            outputs["mesh_warning"] = (mesh_result.stdout + mesh_result.stderr)[-2000:]
            JOB_STORE.update(job_id, message="Elevation layers are ready, but the 3D mesh export failed.")
    return outputs


def _run_reference_evaluation_job(job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Evaluate a generated product against a reference raster and/or GCPs."""

    prediction_path = _repo_path(str(payload.get("prediction_path", "")))
    if not prediction_path.is_file():
        raise ValueError("The prediction raster does not exist.")
    reference_value = payload.get("reference_path")
    gcp_value = payload.get("gcp_csv")
    if not reference_value and not gcp_value:
        raise ValueError("Provide a reference_path, a gcp_csv, or both.")

    report: dict[str, Any] = {"prediction": _relative(prediction_path)}
    if reference_value:
        reference_path = _repo_path(str(reference_value))
        if not reference_path.is_file():
            raise ValueError("The reference raster does not exist.")
        prediction, reference, alignment = load_aligned_reference(
            prediction_path, reference_path
        )
        report["reference"] = _relative(reference_path)
        report["alignment"] = alignment
        report["raster_metrics"] = compute_metrics(prediction, reference).__dict__
    if gcp_value:
        gcp_path = _repo_path(str(gcp_value))
        if not gcp_path.is_file():
            raise ValueError("The GCP CSV does not exist.")
        predicted, reference, _ = read_gcp_csv(prediction_path, gcp_path)
        report["gcp_csv"] = _relative(gcp_path)
        report["gcp_raw_metrics"] = compute_metrics(predicted, reference).__dict__
        report["gcp_calibration"] = evaluate_gcp_calibration(
            predicted,
            reference,
            calibration_fraction=float(payload.get("calibration_fraction", 0.7)),
            seed=int(payload.get("seed", 42)),
        )

    report_path = JOBS_ROOT / job_id / "reference_evaluation.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    report["report_path"] = _relative(report_path)
    return report


class PortalHandler(SimpleHTTPRequestHandler):
    """Serve the portal and its small local API."""

    server_version = "HeightNetLocal/0.1"

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(PORTAL_ROOT), **kwargs)

    def _send_json(self, payload: object, status: int = 200) -> None:
        body = _json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _redirect(self, location: str) -> None:
        self.send_response(302)
        self.send_header("Location", location)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length > MAX_UPLOAD_BYTES:
            raise ValueError("Request body is too large.")
        raw = self.rfile.read(length)
        value = json.loads(raw.decode("utf-8"))
        if not isinstance(value, dict):
            raise ValueError("Request body must be a JSON object.")
        return value

    def _serve_viewer_file(self, relative_path: str) -> None:
        """Serve the standalone viewer without exposing the repository tree."""

        requested = relative_path.strip("/") or "index.html"
        candidate = (VIEWER_ROOT / requested).resolve()
        try:
            candidate.relative_to(VIEWER_ROOT.resolve())
        except ValueError as exc:
            raise FileNotFoundError("Viewer path is outside the viewer directory.") from exc
        if not candidate.is_file():
            raise FileNotFoundError(candidate)
        body = candidate.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(candidate.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_workspace_file(self, relative_path: str) -> None:
        """Serve the built React workspace without exposing source files."""

        requested = relative_path.strip("/") or "index.html"
        candidate = (WORKSPACE_ROOT / requested).resolve()
        try:
            candidate.relative_to(WORKSPACE_ROOT.resolve())
        except ValueError as exc:
            raise FileNotFoundError("Workspace path is outside the build directory.") from exc
        if not candidate.is_file():
            raise FileNotFoundError(candidate)
        body = candidate.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(candidate.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_raster_preview(self, path: Path, palette: str) -> None:
        """Render one generated raster as a browser-friendly PNG preview."""

        try:
            import numpy as np
            import rasterio
            from PIL import Image
        except ImportError as exc:
            raise RuntimeError("Raster previews require Rasterio, NumPy, and Pillow.") from exc

        with rasterio.open(path) as dataset:
            data = dataset.read(1, masked=True).astype("float32")
        values = data.filled(np.nan)
        valid = np.isfinite(values)
        if not valid.any():
            raise ValueError("The raster has no valid pixels.")

        low, high = np.nanpercentile(values, (2, 98))
        if not np.isfinite(low) or not np.isfinite(high) or high <= low:
            low = float(np.nanmin(values))
            high = low + 1.0
        normalized = np.clip((values - low) / (high - low), 0.0, 1.0)
        normalized = np.where(valid, normalized, 0.0)

        palettes = {
            "elevation": np.array([[35, 23, 92], [43, 111, 190], [25, 180, 170], [144, 220, 75], [245, 190, 45], [190, 55, 35]], dtype=np.float32),
            "confidence": np.array([[30, 38, 48], [38, 126, 184], [67, 183, 140], [220, 235, 120]], dtype=np.float32),
            "risk": np.array([[22, 35, 45], [44, 120, 170], [244, 190, 72], [210, 55, 55]], dtype=np.float32),
            "gray": np.array([[15, 15, 15], [240, 240, 240]], dtype=np.float32),
        }
        stops = palettes.get(palette, palettes["elevation"])
        positions = np.linspace(0.0, 1.0, len(stops))
        rgb = np.empty((*values.shape, 3), dtype=np.uint8)
        for channel in range(3):
            rgb[..., channel] = np.interp(normalized, positions, stops[:, channel]).astype(np.uint8)
        rgba = np.concatenate([rgb, (valid.astype(np.uint8) * 255)[..., None]], axis=2)

        output = BytesIO()
        Image.fromarray(rgba, mode="RGBA").save(output, format="PNG", optimize=True)
        body = output.getvalue()
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/globe" or parsed.path.startswith("/globe/"):
            self._redirect("/?view=map")
            return
        if (
            parsed.path == "/classic"
            or parsed.path.startswith("/classic/")
            or parsed.path == "/landing"
            or parsed.path.startswith("/landing/")
        ):
            self._redirect("/")
            return
        # The React workspace is the main HeightNet product screen.  Keep the
        # old standalone viewer available at /viewer/, but let the React app
        # own its dedicated 3D route at /viewer/3d.
        if parsed.path in {"/", "/workspace", "/workspace/", "/viewer/3d", "/viewer/3d/"}:
            try:
                self._serve_workspace_file("index.html")
            except FileNotFoundError:
                self.send_error(404, "Workspace build not found. Run npm install and npm run build in portal/workspace-src.")
            return
        if parsed.path == "/viewer" or parsed.path.startswith("/viewer/"):
            try:
                relative_path = parsed.path.removeprefix("/viewer/")
                self._serve_viewer_file(relative_path)
            except FileNotFoundError:
                self.send_error(404, "Viewer file not found")
            return
        if parsed.path.startswith("/workspace/"):
            try:
                relative_path = parsed.path.removeprefix("/workspace/")
                self._serve_workspace_file(relative_path)
            except FileNotFoundError:
                self.send_error(404, "Workspace build not found. Run npm install and npm run build in portal/workspace-src.")
            return
        if parsed.path == "/api/health":
            self._send_json({"status": "ok", "service": "heightnet-portal"})
            return
        if parsed.path == "/api/geocode":
            query = parse_qs(parsed.query).get("q", [""])[0]
            try:
                self._send_json({"results": geocode_place(query)})
            except Exception as exc:
                self._send_json({"error": str(exc)}, status=400)
            return
        if parsed.path == "/api/scenes":
            query = parse_qs(parsed.query)
            try:
                bbox = validate_bbox(query.get("bbox", [""])[0].split(","))
                cloud = float(query.get("cloud", ["30"])[0])
                limit = int(query.get("limit", ["10"])[0])
                date_from = query.get("from", [""])[0].strip() or None
                date_to = query.get("to", [""])[0].strip() or None
                search_kwargs: dict[str, Any] = {"max_cloud": cloud, "limit": limit}
                if date_from is not None:
                    search_kwargs["date_from"] = date_from
                if date_to is not None:
                    search_kwargs["date_to"] = date_to
                scenes = search_sentinel2_scenes(bbox, **search_kwargs)
                self._send_json({"bbox": bbox, "scenes": scenes})
            except Exception as exc:
                self._send_json({"error": str(exc)}, status=400)
            return
        if parsed.path == "/api/reference-availability":
            query = parse_qs(parsed.query)
            try:
                bbox = validate_bbox(query.get("bbox", [""])[0].split(","))
                include_remote = query.get("remote", ["1"])[0].lower() not in {"0", "false", "no"}
                self._send_json(
                    discover_sources(
                        REPO_ROOT,
                        bbox,
                        include_remote_catalog=include_remote,
                    )
                )
            except Exception as exc:
                self._send_json({"error": str(exc)}, status=400)
            return
        if parsed.path == "/api/evaluation":
            self._send_json({"rows": self._evaluation_rows()})
            return
        if parsed.path == "/api/raster-stats":
            try:
                value = parse_qs(parsed.query).get("path", [""])[0]
                path = _repo_path(unquote(value))
                if not path.is_file():
                    raise FileNotFoundError(path)
                self._send_json(raster_stats(path))
            except Exception as exc:
                self._send_json({"error": str(exc)}, status=400)
            return
        if parsed.path == "/api/inspect":
            try:
                query = parse_qs(parsed.query)
                value = query.get("path", [""])[0]
                path = _repo_path(unquote(value))
                if not path.is_file():
                    raise FileNotFoundError(path)
                x = float(query.get("x", [""])[0])
                y = float(query.get("y", [""])[0])
                mode = query.get("mode", ["pixel"])[0]
                self._send_json(inspect_raster(path, x, y, coordinate_mode=mode))
            except Exception as exc:
                self._send_json({"error": str(exc)}, status=400)
            return
        if parsed.path == "/api/profile":
            try:
                query = parse_qs(parsed.query)
                value = query.get("path", [""])[0]
                path = _repo_path(unquote(value))
                if not path.is_file():
                    raise FileNotFoundError(path)
                start = (float(query.get("start_x", [""])[0]), float(query.get("start_y", [""])[0]))
                end = (float(query.get("end_x", [""])[0]), float(query.get("end_y", [""])[0]))
                samples = int(query.get("samples", ["64"])[0])
                self._send_json(profile_raster(path, start, end, samples=samples))
            except Exception as exc:
                self._send_json({"error": str(exc)}, status=400)
            return
        if parsed.path == "/api/raster-preview":
            try:
                query = parse_qs(parsed.query)
                value = query.get("path", [""])[0]
                path = _repo_path(unquote(value))
                if not path.is_file():
                    raise FileNotFoundError(path)
                palette = query.get("palette", ["elevation"])[0]
                self._serve_raster_preview(path, palette)
            except Exception as exc:
                self._send_json({"error": str(exc)}, status=400)
            return
        if parsed.path.startswith("/api/jobs/"):
            job_id = parsed.path.rsplit("/", 1)[-1]
            job = JOB_STORE.get(job_id)
            if job is None:
                self._send_json({"error": "Job not found."}, status=404)
            else:
                self._send_json(job.as_dict())
            return
        if parsed.path == "/api/file":
            try:
                value = parse_qs(parsed.query).get("path", [""])[0]
                path = _repo_path(unquote(value))
                if not path.is_file():
                    raise FileNotFoundError(path)
                allowed_root = JOBS_ROOT.resolve()
                path.resolve().relative_to(allowed_root)
                body = path.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", mimetypes.guess_type(path.name)[0] or "application/octet-stream")
                if path.suffix.lower() in {".qgs", ".qgz"}:
                    self.send_header("Content-Disposition", f'attachment; filename="{path.name}"')
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception as exc:
                self._send_json({"error": str(exc)}, status=404)
            return
        super().do_GET()

    @staticmethod
    def _evaluation_rows() -> list[dict[str, str]]:
        rows: list[dict[str, str]] = []
        reports_root = REPO_ROOT / "reports"
        for path in sorted(reports_root.glob("*.json")):
            try:
                document = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            for row in _metric_rows(document):
                row["report"] = path.name
                rows.append(row)
        return rows[:250]

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/upload":
                self._handle_upload()
                return
            if parsed.path == "/api/upload-reference":
                self._handle_reference_upload()
                return
            payload = self._read_json()
            if parsed.path == "/api/imagery":
                self._handle_imagery(payload)
                return
            if parsed.path == "/api/download":
                self._handle_download(payload)
                return
            if parsed.path == "/api/process":
                self._handle_process(payload)
                return
            if parsed.path == "/api/evaluate":
                self._handle_evaluate(payload)
                return
            if parsed.path == "/api/open-qgis":
                self._handle_open_qgis(payload)
                return
            if parsed.path == "/api/export-bundle":
                self._handle_export_bundle(payload)
                return
            self._send_json({"error": "Unknown API route."}, status=404)
        except Exception as exc:
            self._send_json({"error": str(exc)}, status=400)

    def _handle_upload(self) -> None:
        filename = Path(self.headers.get("X-Filename", "uploaded_image")).name
        if Path(filename).suffix.lower() not in {".png", ".jpg", ".jpeg", ".tif", ".tiff"}:
            raise ValueError("Upload a PNG, JPG, JPEG, TIFF, or GeoTIFF file.")
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_UPLOAD_BYTES:
            raise ValueError("Upload size is missing or too large.")
        upload_dir = JOBS_ROOT / "uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)
        path = upload_dir / f"upload_{uuid.uuid4().hex[:12]}_{filename}"
        path.write_bytes(self.rfile.read(length))
        try:
            description = describe_input(path)
            info = {
                "kind": description.kind.value,
                "width": description.width,
                "height": description.height,
                "crs": description.crs,
            }
        except Exception as exc:
            path.unlink(missing_ok=True)
            raise ValueError(f"Upload could not be inspected: {exc}") from exc
        self._send_json({"path": _relative(path), "filename": filename, "input": info})

    def _handle_reference_upload(self) -> None:
        filename = Path(self.headers.get("X-Filename", "reference")).name
        suffix = Path(filename).suffix.lower()
        if suffix not in {".csv", ".tif", ".tiff"}:
            raise ValueError("Reference upload must be a CSV, TIFF, or GeoTIFF file.")
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_UPLOAD_BYTES:
            raise ValueError("Upload size is missing or too large.")
        upload_dir = JOBS_ROOT / "uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)
        path = upload_dir / f"reference_{uuid.uuid4().hex[:12]}_{filename}"
        path.write_bytes(self.rfile.read(length))
        info: dict[str, Any] = {"kind": "gcp_csv" if suffix == ".csv" else "reference_raster"}
        if suffix in {".tif", ".tiff"}:
            try:
                description = describe_input(path)
                info.update(
                    {
                        "width": description.width,
                        "height": description.height,
                        "crs": description.crs,
                    }
                )
            except Exception as exc:
                path.unlink(missing_ok=True)
                raise ValueError(f"Reference raster could not be inspected: {exc}") from exc
        self._send_json({"path": _relative(path), "filename": filename, "reference": info})

    def _handle_imagery(self, payload: dict[str, Any]) -> None:
        """Compatibility route for older clients that ask for one image.

        The main workspace uses the safer two-step scene-search/download flow,
        but both routes end up in the same real Sentinel-2 RGB downloader.
        """

        bbox = validate_bbox(payload.get("bbox", []))
        output_format = str(payload.get("format", "geotiff")).lower()
        if output_format not in {"geotiff", "png"}:
            raise ValueError("format must be 'geotiff' or 'png'.")
        max_cloud = float(payload.get("max_cloud_cover", 30.0))
        requested_scene = payload.get("scene")
        if requested_scene is not None and not isinstance(requested_scene, dict):
            raise ValueError("scene must be an object returned by /api/scenes.")
        scenes = [requested_scene] if isinstance(requested_scene, dict) else search_sentinel2_scenes(bbox, max_cloud=max_cloud, limit=1)
        if not scenes:
            raise ValueError("No Sentinel-2 scene matched this area and cloud limit.")

        scene = scenes[0]
        artifact_id = f"imagery-{uuid.uuid4().hex[:12]}"
        artifact_dir = JOBS_ROOT / artifact_id
        artifact_dir.mkdir(parents=True, exist_ok=True)
        geotiff_path = artifact_dir / "sentinel2_rgb.tif"
        downloaded = download_scene_rgb(scene, geotiff_path, bbox=bbox)
        valid_fraction = _rgb_valid_fraction(downloaded)
        if valid_fraction < MIN_SENTINEL_VALID_FRACTION:
            raise ValueError(
                "This Sentinel-2 capture does not cover enough of the selected area "
                f"({valid_fraction:.0%} valid pixels). Choose another date or draw a "
                "smaller area inside the scene footprint."
            )
        visual_path = artifact_dir / "sentinel2_visual.tif"
        try:
            download_scene_visual(scene, visual_path, bbox=bbox)
        except AcquisitionError:
            visual_path = None

        artifact_path = downloaded
        if output_format == "png":
            try:
                import numpy as np
                import rasterio
                from PIL import Image
            except ImportError as exc:
                raise ValueError("PNG export requires Rasterio, NumPy, and Pillow.") from exc
            png_path = artifact_dir / "sentinel2_rgb.png"
            with rasterio.open(downloaded) as dataset:
                rgb = dataset.read([1, 2, 3]).astype("float32")
            low, high = np.percentile(rgb, (2, 98))
            if high <= low:
                high = low + 1.0
            scaled = np.clip((rgb - low) / (high - low) * 255.0, 0, 255).astype("uint8")
            Image.fromarray(np.moveaxis(scaled, 0, -1), mode="RGB").save(png_path)
            artifact_path = png_path

        description = describe_input(downloaded)
        properties = scene.get("feature", {}).get("properties", {})
        cloud_cover = properties.get("eo:cloud_cover")
        capture_date = properties.get("datetime") or properties.get("start_datetime") or "unknown"
        response = {
            "success": True,
            "bbox": list(bbox),
            "format": output_format,
            "source": {
                "collection": "sentinel-2-l2a",
                "scene_id": scene.get("scene_id", "unknown"),
                "acquisition_date": capture_date,
                "cloud_cover": cloud_cover,
                "aoi_cloud_cover": None,
            },
            "crs": description.crs,
            "resolution_m": 10.0,
            "artifact_id": artifact_id,
            "filename": artifact_path.name,
            "download_url": f"/api/file?path={_relative(artifact_path)}",
            "file": _relative(artifact_path),
            "visual_file": _relative(visual_path) if visual_path and visual_path.is_file() else None,
            "dimensions": [description.height, description.width],
            "valid_fraction": valid_fraction,
        }
        self._send_json(response)

    def _handle_download(self, payload: dict[str, Any]) -> None:
        scene = payload.get("scene")
        if not isinstance(scene, dict):
            raise ValueError("A selected scene is required.")
        bbox = validate_bbox(payload.get("bbox", []))
        job = JOB_STORE.create("sentinel2-download")
        output = JOBS_ROOT / job.id / "scene_rgb.tif"

        def worker() -> dict[str, Any]:
            path = download_scene_rgb(scene, output, bbox=bbox)
            visual = output.with_name("scene_visual.tif")
            try:
                download_scene_visual(scene, visual, bbox=bbox)
            except AcquisitionError:
                visual = None
            return {
                "input_path": _relative(path),
                "texture_path": _relative(visual) if visual and visual.is_file() else None,
                "scene_id": scene.get("scene_id"),
            }

        JOB_STORE.start(job, worker)
        self._send_json(job.as_dict(), status=202)

    def _handle_process(self, payload: dict[str, Any]) -> None:
        if not payload.get("input_path"):
            raise ValueError("An input_path from an upload or download job is required.")
        job = JOB_STORE.create("heightnet-process")
        JOB_STORE.start(job, lambda: _run_pipeline_job(job.id, payload))
        self._send_json(job.as_dict(), status=202)

    def _handle_evaluate(self, payload: dict[str, Any]) -> None:
        if not payload.get("prediction_path"):
            raise ValueError("A prediction_path is required.")
        if not payload.get("reference_path") and not payload.get("gcp_csv"):
            raise ValueError("Provide a reference_path, a gcp_csv, or both.")
        job = JOB_STORE.create("reference-evaluation")
        JOB_STORE.start(job, lambda: _run_reference_evaluation_job(job.id, payload))
        self._send_json(job.as_dict(), status=202)

    def _handle_open_qgis(self, payload: dict[str, Any]) -> None:
        """Create one QGIS project from the current HeightNet result."""

        raw_layers = payload.get("layers")
        if not isinstance(raw_layers, list) or not raw_layers:
            raise ValueError("At least one raster layer is required to open QGIS.")

        layers: list[dict[str, Any]] = []
        seen: set[Path] = set()
        allowed_suffixes = {".tif", ".tiff", ".vrt", ".png", ".jpg", ".jpeg"}
        for item in raw_layers:
            if not isinstance(item, dict) or not item.get("path"):
                continue
            path = _repo_path(str(item["path"]))
            if path.suffix.lower() not in allowed_suffixes:
                continue
            if not path.is_file() or path in seen:
                continue
            seen.add(path)
            layers.append(
                {
                    "path": str(path),
                    "label": str(item.get("label") or path.stem),
                    "visible": bool(item.get("visible", True)),
                    "opacity": float(item.get("opacity", 1.0)),
                }
            )

        if not layers:
            raise ValueError("None of the supplied raster layers exists anymore.")

        project_path, _ = prepare_qgis_project(JOBS_ROOT, layers)
        launched, message = open_qgis_project(project_path)
        relative_project = _relative(project_path)
        self._send_json(
            {
                "project_path": relative_project,
                "project_url": f"/api/file?path={relative_project}",
                "layers": [{"label": layer["label"], "visible": layer["visible"], "opacity": layer["opacity"]} for layer in layers],
                "qgis_found": launched or "QGIS was not found" not in message,
                "qgis_launched": launched,
                "message": message,
            }
        )

    def _handle_export_bundle(self, payload: dict[str, Any]) -> None:
        """Package the current result files so users do not have to download them one by one."""

        raw_files = payload.get("files")
        if not isinstance(raw_files, list):
            raise ValueError("A list of output files is required.")
        files: list[tuple[Path, str]] = []
        seen: set[Path] = set()
        for item in raw_files:
            if not isinstance(item, dict) or not item.get("path"):
                continue
            path = _repo_path(str(item["path"]))
            if not path.is_file() or path in seen:
                continue
            seen.add(path)
            label = Path(str(item.get("name") or path.name)).name
            files.append((path, label))
        if not files:
            raise ValueError("None of the supplied output files exist anymore.")

        bundle_id = f"export-{uuid.uuid4().hex[:12]}"
        bundle_dir = JOBS_ROOT / bundle_id
        bundle_dir.mkdir(parents=True, exist_ok=True)
        bundle_path = bundle_dir / "heightnet-results.zip"
        with zipfile.ZipFile(bundle_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for path, label in files:
                archive.write(path, arcname=label)
        relative_bundle = _relative(bundle_path)
        self._send_json(
            {
                "path": relative_bundle,
                "url": f"/api/file?path={relative_bundle}",
                "filename": bundle_path.name,
                "files": [label for _, label in files],
            }
        )


def create_server(host: str = "127.0.0.1", port: int = 8000) -> ThreadingHTTPServer:
    """Create the local portal server for tests or the CLI."""

    return ThreadingHTTPServer((host, port), PortalHandler)
