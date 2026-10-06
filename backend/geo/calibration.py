"""Robust affine calibration for relative heights and metric elevations."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


class CalibrationError(ValueError):
    """Raised when calibration inputs cannot produce a valid affine fit."""


@dataclass(frozen=True)
class CalibrationResult:
    """Parameters and diagnostics produced by :func:`fit_affine`."""

    scale: float
    offset: float
    residual_mae: float
    residual_rmse: float
    inlier_count: int
    sample_count: int

    def apply(self, relative_values: np.ndarray | list[float]) -> np.ndarray:
        """Convert relative values using this calibration result."""

        return apply_affine(relative_values, self.scale, self.offset)


def _weighted_fit(
    relative_values: np.ndarray,
    reference_values: np.ndarray,
    weights: np.ndarray,
) -> tuple[float, float]:
    """Solve a weighted least-squares affine fit."""

    design = np.column_stack((relative_values, np.ones(relative_values.size)))
    weighted_design = design * np.sqrt(weights)[:, None]
    weighted_reference = reference_values * np.sqrt(weights)

    try:
        parameters, _, rank, _ = np.linalg.lstsq(
            weighted_design,
            weighted_reference,
            rcond=None,
        )
    except np.linalg.LinAlgError as exc:
        raise CalibrationError("Could not solve the affine calibration.") from exc

    if rank < 2:
        raise CalibrationError(
            "Relative heights must contain at least two distinct values."
        )

    return float(parameters[0]), float(parameters[1])


def fit_affine(
    relative_values: np.ndarray | list[float],
    reference_values: np.ndarray | list[float],
    *,
    weights: np.ndarray | list[float] | None = None,
    robust: bool = True,
    max_iterations: int = 20,
    convergence_tolerance: float = 1e-7,
) -> CalibrationResult:
    """Fit ``metric = scale * relative + offset``.

    Non-finite observations are ignored. When ``robust`` is enabled, Huber-style
    iteratively reweighted least squares limits the influence of mismatched DEM
    samples and other outliers.
    """

    if max_iterations < 1:
        raise CalibrationError("max_iterations must be at least 1.")
    if convergence_tolerance <= 0:
        raise CalibrationError("convergence_tolerance must be positive.")

    relative = np.asarray(relative_values, dtype=float).reshape(-1)
    reference = np.asarray(reference_values, dtype=float).reshape(-1)
    if relative.size != reference.size:
        raise CalibrationError("Relative and reference values must have equal size.")

    if weights is None:
        base_weights = np.ones(relative.size, dtype=float)
    else:
        base_weights = np.asarray(weights, dtype=float).reshape(-1)
        if base_weights.size != relative.size:
            raise CalibrationError("Weights must have the same size as the values.")

    valid = np.isfinite(relative) & np.isfinite(reference) & np.isfinite(base_weights)
    valid &= base_weights > 0
    relative = relative[valid]
    reference = reference[valid]
    base_weights = base_weights[valid]

    if relative.size < 2:
        raise CalibrationError("At least two valid observations are required.")
    if np.ptp(relative) <= np.finfo(float).eps:
        raise CalibrationError("Relative heights must contain at least two distinct values.")

    effective_weights = base_weights.copy()
    scale, offset = _weighted_fit(relative, reference, effective_weights)

    if robust:
        for _ in range(max_iterations):
            residuals = reference - (scale * relative + offset)
            centered = residuals - np.median(residuals)
            dispersion = 1.4826 * np.median(np.abs(centered))
            if dispersion <= np.finfo(float).eps:
                break

            threshold = 1.345 * dispersion
            robust_weights = np.minimum(1.0, threshold / np.maximum(np.abs(centered), threshold))
            effective_weights = base_weights * robust_weights
            next_scale, next_offset = _weighted_fit(
                relative,
                reference,
                effective_weights,
            )
            if max(abs(next_scale - scale), abs(next_offset - offset)) <= convergence_tolerance:
                scale, offset = next_scale, next_offset
                break
            scale, offset = next_scale, next_offset

    residuals = reference - (scale * relative + offset)
    residual_mae = float(np.mean(np.abs(residuals)))
    residual_rmse = float(np.sqrt(np.mean(residuals**2)))

    if robust:
        centered = residuals - np.median(residuals)
        dispersion = 1.4826 * np.median(np.abs(centered))
        if dispersion <= np.finfo(float).eps:
            inliers = np.ones(residuals.size, dtype=bool)
        else:
            inliers = np.abs(centered) <= 1.345 * dispersion
    else:
        inliers = np.ones(residuals.size, dtype=bool)

    return CalibrationResult(
        scale=scale,
        offset=offset,
        residual_mae=residual_mae,
        residual_rmse=residual_rmse,
        inlier_count=int(np.count_nonzero(inliers)),
        sample_count=int(relative.size),
    )


def apply_affine(
    relative_values: np.ndarray | list[float],
    scale: float,
    offset: float,
) -> np.ndarray:
    """Apply an affine calibration while preserving the input shape."""

    values = np.asarray(relative_values, dtype=float)
    if not np.isfinite(scale) or not np.isfinite(offset):
        raise CalibrationError("Scale and offset must be finite numbers.")
    return scale * values + offset


def compose_dsm(
    ground_elevation: np.ndarray | list[float],
    above_ground_height: np.ndarray | list[float],
) -> np.ndarray:
    """Compose an absolute DSM from ground elevation and above-ground height.

    A coarse DEM such as SRTM represents the terrain surface, while a trained
    height model may represent object height above that surface. They must be
    kept as separate quantities; adding them is the physically meaningful DSM
    composition step.
    """

    ground = np.asarray(ground_elevation, dtype=float)
    height = np.asarray(above_ground_height, dtype=float)
    if ground.shape != height.shape:
        raise CalibrationError(
            "Ground elevation and above-ground height must have equal shape."
        )
    return ground + height
