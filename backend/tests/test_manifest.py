from __future__ import annotations

from backend.acquisition.manifest import build_source_manifest


def test_manifest_keeps_ground_and_validation_roles_separate() -> None:
    manifest = build_source_manifest(
        input_path="data/input.tif",
        input_kind="georeferenced",
        ground_path="data/jobs/ground.tif",
        ground_source={
            "id": "global:nasadem",
            "name": "NASADEM",
            "role": "coarse_ground",
            "status": "selected",
            "provider": "Microsoft Planetary Computer",
        },
        availability={
            "summary": {"reference_available": True, "gcp_upload_supported": True},
            "sources": [
                {"id": "lidar-1", "name": "Airborne LiDAR", "role": "validation_reference", "status": "available"},
                {"id": "gcp-1", "name": "Surveyed GCPs", "role": "calibration_reference", "status": "manual_upload"},
            ],
        },
        bbox=(77.0, 28.0, 77.1, 28.1),
    )

    assert manifest["coarse_ground"]["role"] == "coarse_ground"
    assert manifest["validation"]["used_for_prediction"] is False
    assert manifest["validation"]["candidates"][0]["name"] == "Airborne LiDAR"
    assert manifest["calibration_references"]["gcp_upload_supported"] is True
    assert manifest["aoi_bbox_wgs84"] == [77.0, 28.0, 77.1, 28.1]


def test_manifest_marks_non_georeferenced_input_as_relative_only() -> None:
    manifest = build_source_manifest(
        input_path="data/image.png",
        input_kind="relative",
    )

    assert manifest["coarse_ground"] is None
    assert "relative height only" in manifest["note"]
