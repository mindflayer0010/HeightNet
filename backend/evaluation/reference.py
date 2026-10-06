"""Reference-raster and GCP evaluation for absolute DSM products."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import csv
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import reproject

from backend.geo.calibration import CalibrationResult, fit_affine


class ReferenceEvaluationError(ValueError):
    """Raised when a reference comparison cannot be performed safely."""


@dataclass(frozen=True)
class RasterMetrics:
    """Error metrics for two aligned elevation arrays."""

    sample_count: int
    mae_m: float
    rmse_m: float
    bias_m: float
    correlation: float | None
    r2: float | None


@dataclass(frozen=True)
class GCPObservation:
    """One surveyed point in the prediction raster CRS."""

    x: float
    y: float
    reference_m: float
    predicted_m: float


def compute_metrics(predicted: np.ndarray, reference: np.ndarray) -> RasterMetrics:
    """Compute metrics after filtering non-finite paired observations."""

    prediction = np.asarray(predicted, dtype=float).reshape(-1)
    truth = np.asarray(reference, dtype=float).reshape(-1)
    if prediction.size != truth.size:
        raise ReferenceEvaluationError("Prediction and reference sizes must match.")
    valid = np.isfinite(prediction) & np.isfinite(truth)
    prediction = prediction[valid]
    truth = truth[valid]
    if prediction.size == 0:
        raise ReferenceEvaluationError("No finite paired elevation samples exist.")

    residual = prediction - truth
    truth_centered = truth - truth.mean()
    denominator = float(np.sum(truth_centered**2))
    correlation = None
    if prediction.size >= 2 and np.std(prediction) > 0 and np.std(truth) > 0:
        correlation = float(np.corrcoef(prediction, truth)[0, 1])
    r2 = None
    if denominator > np.finfo(float).eps:
        r2 = float(1.0 - np.sum(residual**2) / denominator)
    return RasterMetrics(
        sample_count=int(prediction.size),
        mae_m=float(np.mean(np.abs(residual))),
        rmse_m=float(np.sqrt(np.mean(residual**2))),
        bias_m=float(np.mean(residual)),
        correlation=correlation,
        r2=r2,
    )


def load_aligned_reference(
    prediction_path: str | Path,
    reference_path: str | Path,
) -> tuple[np.ndarray, np.ndarray, dict[str, object]]:
    """Reproject a reference raster onto the prediction raster grid.

    Bilinear resampling is used because the reference is treated as a
    continuous elevation surface. The source and destination CRS must both be
    present; nodata and non-finite values are excluded from metrics.
    """

    with rasterio.open(prediction_path) as prediction_ds, rasterio.open(
        reference_path
    ) as reference_ds:
        if prediction_ds.crs is None or reference_ds.crs is None:
            raise ReferenceEvaluationError(
                "Both prediction and reference rasters must have a CRS."
            )
        prediction = prediction_ds.read(1, masked=True).filled(np.nan).astype(float)
        aligned_reference = np.full(prediction.shape, np.nan, dtype=np.float32)
        reproject(
            source=rasterio.band(reference_ds, 1),
            destination=aligned_reference,
            src_transform=reference_ds.transform,
            src_crs=reference_ds.crs,
            src_nodata=reference_ds.nodata,
            dst_transform=prediction_ds.transform,
            dst_crs=prediction_ds.crs,
            dst_nodata=np.nan,
            resampling=Resampling.bilinear,
        )
        metadata = {
            "prediction_crs": prediction_ds.crs.to_string(),
            "reference_crs": reference_ds.crs.to_string(),
            "prediction_shape": list(prediction.shape),
            "reference_shape": [reference_ds.height, reference_ds.width],
            "resampling": "bilinear",
            "prediction_bounds": [float(value) for value in prediction_ds.bounds],
        }
    return prediction, aligned_reference.astype(float), metadata


def read_gcp_csv(
    prediction_path: str | Path,
    gcp_csv: str | Path,
) -> tuple[np.ndarray, np.ndarray, list[GCPObservation]]:
    """Read ``x,y,reference_m`` points and sample prediction heights.

    Coordinates must be expressed in the prediction raster CRS. An optional
    ``id`` column is preserved only for human-readable source files; the
    evaluator intentionally uses no point identity for the calculations.
    """

    points: list[tuple[float, float, float]] = []
    with Path(gcp_csv).open(newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source)
        required = {"x", "y", "reference_m"}
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            raise ReferenceEvaluationError(
                "GCP CSV must contain x,y,reference_m columns in the prediction CRS."
            )
        for row in reader:
            if not row.get("x") or not row.get("y") or not row.get("reference_m"):
                continue
            points.append((float(row["x"]), float(row["y"]), float(row["reference_m"])))
    if len(points) < 2:
        raise ReferenceEvaluationError("At least two valid GCP rows are required.")

    with rasterio.open(prediction_path) as prediction_ds:
        sampled = [float(value[0]) for value in prediction_ds.sample([(x, y) for x, y, _ in points])]
    observations = [
        GCPObservation(x, y, reference, predicted)
        for (x, y, reference), predicted in zip(points, sampled)
        if np.isfinite(predicted) and np.isfinite(reference)
    ]
    if len(observations) < 2:
        raise ReferenceEvaluationError("Fewer than two finite GCP samples are covered by the raster.")
    predicted = np.asarray([item.predicted_m for item in observations], dtype=float)
    reference = np.asarray([item.reference_m for item in observations], dtype=float)
    return predicted, reference, observations


def evaluate_gcp_calibration(
    predicted: np.ndarray,
    reference: np.ndarray,
    *,
    calibration_fraction: float = 0.7,
    seed: int = 42,
) -> dict[str, object]:
    """Fit on calibration GCPs and report untouched holdout GCP metrics."""

    if not 0.0 < calibration_fraction < 1.0:
        raise ReferenceEvaluationError("calibration_fraction must be between 0 and 1.")
    predicted = np.asarray(predicted, dtype=float).reshape(-1)
    reference = np.asarray(reference, dtype=float).reshape(-1)
    if predicted.size != reference.size or predicted.size < 4:
        raise ReferenceEvaluationError("At least four paired GCPs are required for a holdout.")
    valid = np.isfinite(predicted) & np.isfinite(reference)
    predicted = predicted[valid]
    reference = reference[valid]
    if predicted.size < 4:
        raise ReferenceEvaluationError("At least four finite GCPs are required for a holdout.")

    rng = np.random.default_rng(seed)
    order = rng.permutation(predicted.size)
    calibration_count = int(round(predicted.size * calibration_fraction))
    calibration_count = min(max(calibration_count, 2), predicted.size - 2)
    calibration_indices = order[:calibration_count]
    holdout_indices = order[calibration_count:]
    calibration = fit_affine(predicted[calibration_indices], reference[calibration_indices])
    calibrated_holdout = calibration.apply(predicted[holdout_indices])
    return {
        "calibration": asdict(calibration),
        "calibration_metrics": asdict(
            compute_metrics(
                calibration.apply(predicted[calibration_indices]),
                reference[calibration_indices],
            )
        ),
        "holdout_metrics": asdict(
            compute_metrics(calibrated_holdout, reference[holdout_indices])
        ),
        "calibration_count": int(calibration_indices.size),
        "holdout_count": int(holdout_indices.size),
        "seed": seed,
    }
