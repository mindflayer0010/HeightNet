"""Small, explicit provenance records for one HeightNet run."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Sequence


def _source_summary(source: dict[str, Any]) -> dict[str, Any]:
    """Keep catalog records useful without copying implementation details."""

    keys = (
        "id",
        "name",
        "role",
        "status",
        "access",
        "provider",
        "url",
        "path",
        "resolution_m",
        "coverage",
    )
    return {key: source[key] for key in keys if key in source and source[key] is not None}


def build_source_manifest(
    *,
    input_path: str | Path,
    input_kind: str,
    ground_path: str | Path | None = None,
    ground_source: dict[str, Any] | None = None,
    availability: dict[str, Any] | None = None,
    bbox: Sequence[float] | None = None,
) -> dict[str, Any]:
    """Describe what the run used and what it deliberately did not use.

    A coarse DEM may create the metric baseline, but it is never silently
    labelled as validation truth. Validation candidates are recorded for the
    later evaluation step and remain outside the prediction path.
    """

    sources = availability.get("sources", []) if availability else []
    if not isinstance(sources, list):
        sources = []
    validation = [
        _source_summary(source)
        for source in sources
        if isinstance(source, dict) and source.get("role") == "validation_reference"
    ]
    calibration = [
        _source_summary(source)
        for source in sources
        if isinstance(source, dict) and source.get("role") == "calibration_reference"
    ]

    selected_ground = dict(ground_source or {})
    if ground_path is not None:
        selected_ground.setdefault("path", str(ground_path))
        selected_ground.setdefault("role", "coarse_ground")
        selected_ground.setdefault("status", "selected")

    manifest: dict[str, Any] = {
        "version": "1.0",
        "input": {
            "path": str(input_path),
            "kind": input_kind,
            "role": "optical_input",
        },
        "aoi_bbox_wgs84": list(bbox) if bbox is not None else None,
        "coarse_ground": selected_ground or None,
        "validation": {
            "used_for_prediction": False,
            "candidates": validation,
            "independent_metrics_ready": bool(
                availability and availability.get("summary", {}).get("reference_available")
            ),
        },
        "calibration_references": {
            "used_for_prediction": False,
            "candidates": calibration,
            "gcp_upload_supported": bool(
                availability and availability.get("summary", {}).get("gcp_upload_supported")
            ),
        },
        "rules": {
            "coarse_dem_is_not_lidar_truth": True,
            "validation_is_kept_out_of_prediction": True,
            "metrics_require_aligned_reference_or_held_out_gcps": True,
        },
    }
    if input_kind != "georeferenced":
        manifest["note"] = "Non-georeferenced input produces relative height only."
    elif selected_ground:
        manifest["note"] = "DSM is composed from the selected coarse ground source plus predicted AGL."
    else:
        manifest["note"] = "No ground source was selected, so no metric DSM was composed."
    return manifest
