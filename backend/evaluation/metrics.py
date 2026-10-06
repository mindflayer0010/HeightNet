"""Regression metrics for predicted and reference elevation rasters."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


class MetricError(ValueError):
    """Raised when metric inputs cannot be compared safely."""


@dataclass(frozen=True)
class RegressionMetrics:
    """Summary metrics for one prediction/reference comparison."""

    mae: float
    rmse: float
    r2: float | None
    sample_count: int


def compute_metrics(
    predicted: np.ndarray | list[float],
    reference: np.ndarray | list[float],
    *,
    mask: np.ndarray | list[bool] | None = None,
) -> RegressionMetrics:
    """Compute MAE, RMSE, and R² over finite, optionally masked samples.

    R² is returned as ``None`` when the reference values are constant because
    the statistic has no defined variance-based denominator in that case.
    """

    predicted_array = np.asarray(predicted, dtype=float)
    reference_array = np.asarray(reference, dtype=float)
    if predicted_array.shape != reference_array.shape:
        raise MetricError("Predicted and reference arrays must have equal shape.")

    valid = np.isfinite(predicted_array) & np.isfinite(reference_array)
    if mask is not None:
        mask_array = np.asarray(mask, dtype=bool)
        if mask_array.shape != predicted_array.shape:
            raise MetricError("Mask must have the same shape as the input arrays.")
        valid &= mask_array

    predicted_values = predicted_array[valid]
    reference_values = reference_array[valid]
    if predicted_values.size == 0:
        raise MetricError("At least one valid sample is required.")

    residuals = predicted_values - reference_values
    mae = float(np.mean(np.abs(residuals)))
    rmse = float(np.sqrt(np.mean(residuals**2)))

    total_sum_squares = float(
        np.sum((reference_values - np.mean(reference_values)) ** 2)
    )
    if total_sum_squares <= np.finfo(float).eps:
        r2 = None
    else:
        residual_sum_squares = float(np.sum(residuals**2))
        r2 = 1.0 - residual_sum_squares / total_sum_squares

    return RegressionMetrics(
        mae=mae,
        rmse=rmse,
        r2=r2,
        sample_count=int(predicted_values.size),
    )
