"""Unified two-mode inference pipeline for HeightNet inputs."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from enum import Enum
import json
from pathlib import Path
from typing import Any

import numpy as np

from backend.geo.calibration import CalibrationResult, compose_dsm
from backend.geo.raster import (
    read_rgb_geotiff,
    write_float_geotiff,
    write_single_band_geotiff,
)
from backend.inference.depth_anything import DepthAnythingV2Estimator
from backend.evaluation.sure_cal import SureCalibration
from backend.evaluation.scene_quality import assess_scene


class PipelineInputError(ValueError):
    """Raised when an input cannot satisfy the pipeline contract."""


class InputKind(str, Enum):
    RELATIVE = "relative"
    GEOREFERENCED = "georeferenced"


@dataclass(frozen=True)
class InputDescription:
    """Detected input contract and raster metadata."""

    path: str
    kind: InputKind
    width: int
    height: int
    band_count: int
    crs: str | None
    transform: tuple[float, ...] | None


@dataclass(frozen=True)
class PipelineResult:
    """Files and claims produced by one inference run."""

    input_kind: str
    metric_scale: bool
    relative_path: Path
    agl_path: Path | None
    dsm_path: Path | None
    metadata_path: Path
    warnings: tuple[str, ...]
    calibration_uncertainty_path: Path | None = None
    calibration_confidence_path: Path | None = None
    scene_risk_path: Path | None = None
    scene_quality_path: Path | None = None


def describe_input(path: str | Path) -> InputDescription:
    """Inspect PNG/JPG/TIFF metadata and select the correct processing mode."""

    source = Path(path)
    if not source.is_file():
        raise PipelineInputError(f"Input file does not exist: {source}")
    if source.suffix.lower() in {".png", ".jpg", ".jpeg"}:
        try:
            from PIL import Image
        except ImportError as exc:
            raise PipelineInputError("PNG/JPG inputs require Pillow.") from exc
        with Image.open(source) as image:
            return InputDescription(
                path=str(source),
                kind=InputKind.RELATIVE,
                width=image.width,
                height=image.height,
                band_count=len(image.getbands()),
                crs=None,
                transform=None,
            )
    if source.suffix.lower() not in {".tif", ".tiff"}:
        raise PipelineInputError("Supported inputs are PNG, JPG, JPEG, TIFF, and GeoTIFF.")

    try:
        import rasterio
    except ImportError as exc:
        raise PipelineInputError("TIFF inputs require Rasterio.") from exc
    with rasterio.open(source) as dataset:
        crs = dataset.crs.to_string() if dataset.crs else None
        transform = tuple(float(value) for value in dataset.transform)
        has_spatial_reference = dataset.crs is not None and not dataset.transform.is_identity
        return InputDescription(
            path=str(source),
            kind=InputKind.GEOREFERENCED if has_spatial_reference else InputKind.RELATIVE,
            width=dataset.width,
            height=dataset.height,
            band_count=dataset.count,
            crs=crs,
            transform=transform if has_spatial_reference else None,
        )


def _read_rgb(path: Path, description: InputDescription) -> np.ndarray:
    if path.suffix.lower() in {".png", ".jpg", ".jpeg"}:
        try:
            from PIL import Image
        except ImportError as exc:
            raise PipelineInputError("PNG/JPG inputs require Pillow.") from exc
        with Image.open(path) as image:
            return np.asarray(image.convert("RGB"))
    if description.band_count < 3:
        raise PipelineInputError("A TIFF/GeoTIFF input must contain at least three RGB bands.")
    return read_rgb_geotiff(path)


def _read_ground_on_grid(
    prediction_path: Path,
    ground_path: str | Path,
) -> np.ndarray:
    try:
        import rasterio
        from rasterio.warp import Resampling, reproject
    except ImportError as exc:
        raise PipelineInputError("Ground alignment requires Rasterio.") from exc

    with rasterio.open(prediction_path) as prediction, rasterio.open(ground_path) as ground:
        if prediction.crs is None or ground.crs is None:
            raise PipelineInputError("Both GeoTIFFs must have CRS metadata for ground alignment.")
        aligned = np.full((prediction.height, prediction.width), np.nan, dtype=np.float32)
        reproject(
            source=rasterio.band(ground, 1),
            destination=aligned,
            src_transform=ground.transform,
            src_crs=ground.crs,
            src_nodata=ground.nodata,
            dst_transform=prediction.transform,
            dst_crs=prediction.crs,
            dst_nodata=np.nan,
            resampling=Resampling.bilinear,
        )
    if not np.isfinite(aligned).any():
        raise PipelineInputError("Ground raster does not overlap the input GeoTIFF.")
    return aligned.astype(np.float32, copy=False)


def run_pipeline(
    input_path: str | Path,
    *,
    estimator: DepthAnythingV2Estimator,
    output_dir: str | Path,
    output_prefix: str | None = None,
    calibration: CalibrationResult | None = None,
    sure_calibration: SureCalibration | None = None,
    semantic_estimator: Any | None = None,
    ground_path: str | Path | None = None,
) -> PipelineResult:
    """Run relative or georeferenced inference without inventing scale."""

    description = describe_input(input_path)
    if calibration is not None and sure_calibration is not None:
        raise PipelineInputError("Supply either calibration or sure_calibration, not both.")
    source = Path(input_path)
    output_root = Path(output_dir)
    output_root.mkdir(parents=True, exist_ok=True)
    prefix = output_prefix or source.stem
    rgb = _read_rgb(source, description)
    semantic = None
    if semantic_estimator is not None:
        prediction, semantic = semantic_estimator.predict_depth_and_probabilities(rgb)
    else:
        prediction = estimator.predict(rgb).relative_depth
    warnings: list[str] = []
    scene_quality = assess_scene(rgb, semantic)
    scene_risk_path: Path
    scene_quality_path = output_root / f"{prefix}_scene_quality.json"
    scene_quality_path.write_text(
        json.dumps(scene_quality.to_dict(), indent=2) + "\n",
        encoding="utf-8",
    )
    if description.kind is InputKind.GEOREFERENCED:
        scene_risk_path = write_single_band_geotiff(
            source,
            output_root / f"{prefix}_scene_risk.tif",
            scene_quality.risk_map,
            description="HeightNet scene ambiguity risk (0 to 1)",
        )
    else:
        scene_risk_path = write_float_geotiff(
            output_root / f"{prefix}_scene_risk.tif",
            scene_quality.risk_map,
            description="HeightNet scene ambiguity risk (0 to 1)",
        )
    for flag in scene_quality.flags:
        warnings.append(f"Scene quality flag: {flag}.")

    if description.kind is InputKind.GEOREFERENCED:
        relative_path = write_single_band_geotiff(
            source,
            output_root / f"{prefix}_relative_depth.tif",
            prediction,
            description="HeightNet relative model output (unitless)",
        )
    else:
        relative_path = write_float_geotiff(
            output_root / f"{prefix}_relative_dsm.tif",
            prediction,
            description="HeightNet relative surface height (unitless model scale)",
        )

    agl_path: Path | None = None
    dsm_path: Path | None = None
    calibration_uncertainty_path: Path | None = None
    calibration_confidence_path: Path | None = None
    metric_scale = False
    if description.kind is InputKind.RELATIVE:
        if calibration is not None or ground_path is not None:
            warnings.append("Calibration and ground data are ignored for non-georeferenced input.")
        warnings.append("No CRS exists; this output is relative and has no metric claim.")
    elif calibration is None and sure_calibration is None:
        warnings.append("No metric calibration supplied; only the georeferenced relative output was written.")
    else:
        metric_scale = True
        if sure_calibration is not None:
            if semantic_estimator is None:
                warnings.append(
                    "SURE-Cal supplied without a semantic estimator; using its global fallback."
                )
                calibrated = sure_calibration.global_calibration.apply(prediction)
            else:
                assert semantic is not None
                uncertainty = sure_calibration.calibration_uncertainty(semantic)
                uncertainty = uncertainty + 5.0 * scene_quality.risk_map
                calibrated = sure_calibration.apply(
                    prediction,
                    semantic,
                    uncertainty=uncertainty,
                    uncertainty_temperature=5.0,
                )
                calibration_uncertainty_path = write_single_band_geotiff(
                    source,
                    output_root / f"{prefix}_calibration_uncertainty.tif",
                    uncertainty,
                    description=(
                        "SURE-Cal calibration uncertainty (residual RMSE, metres)"
                    ),
                )
                confidence = np.exp(-uncertainty / 5.0).astype(np.float32)
                calibration_confidence_path = write_single_band_geotiff(
                    source,
                    output_root / f"{prefix}_calibration_confidence.tif",
                    confidence,
                    description=(
                        "SURE-Cal semantic correction confidence (0 to 1)"
                    ),
                )
        else:
            calibrated = calibration.apply(prediction)
        agl = np.maximum(calibrated, 0.0).astype(np.float32)
        agl_path = write_single_band_geotiff(
            source,
            output_root / f"{prefix}_predicted_agl.tif",
            agl,
            description="HeightNet calibrated above-ground height (metres)",
        )
        if ground_path is None:
            warnings.append("AGL is metric-scaled, but no ground raster was supplied; DSM was not composed.")
        else:
            ground = _read_ground_on_grid(source, ground_path)
            dsm = compose_dsm(ground, agl)
            dsm_path = write_single_band_geotiff(
                source,
                output_root / f"{prefix}_estimated_dsm.tif",
                dsm,
                description="HeightNet calibrated experimental DSM (metres)",
            )

    metadata_path = output_root / f"{prefix}_pipeline_metadata.json"
    input_metadata = asdict(description)
    input_metadata["kind"] = description.kind.value
    metadata: dict[str, Any] = {
        "input": input_metadata,
        "input_kind": description.kind.value,
        "metric_scale": metric_scale,
        "checkpoint_model": estimator.model_id,
        "device": estimator.device,
        "calibration_supplied": calibration is not None,
        "sure_calibration_supplied": sure_calibration is not None,
        "semantic_estimator_supplied": semantic_estimator is not None,
        "ground_supplied": ground_path is not None,
        "outputs": {
            "relative": str(relative_path),
            "agl": str(agl_path) if agl_path else None,
            "dsm": str(dsm_path) if dsm_path else None,
            "calibration_uncertainty": (
                str(calibration_uncertainty_path)
                if calibration_uncertainty_path
                else None
            ),
            "calibration_confidence": (
                str(calibration_confidence_path)
                if calibration_confidence_path
                else None
            ),
            "scene_risk": str(scene_risk_path),
            "scene_quality": str(scene_quality_path),
        },
        "scene_quality": scene_quality.to_dict(),
        "warnings": warnings,
    }
    metadata_path.write_text(json.dumps(metadata, indent=2, default=str) + "\n", encoding="utf-8")
    return PipelineResult(
        input_kind=description.kind.value,
        metric_scale=metric_scale,
        relative_path=relative_path,
        agl_path=agl_path,
        dsm_path=dsm_path,
        metadata_path=metadata_path,
        warnings=tuple(warnings),
        calibration_uncertainty_path=calibration_uncertainty_path,
        calibration_confidence_path=calibration_confidence_path,
        scene_risk_path=scene_risk_path,
        scene_quality_path=scene_quality_path,
    )
