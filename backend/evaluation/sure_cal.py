"""Semantic and uncertainty-aware residual calibration for height estimates.

SURE-Cal is deliberately a post-hoc module. It does not alter the trained
depth backbone: a stable global affine calibration is retained as a fallback,
while semantic evidence selects a class-conditioned calibration when the
prediction is confident. This makes the method cheap to ablate and prevents
rare semantic classes from producing unstable affine parameters.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Mapping

import numpy as np

from backend.geo.calibration import CalibrationError, CalibrationResult, fit_affine


class SureCalibrationError(ValueError):
    """Raised when SURE-Cal inputs cannot be safely calibrated."""


@dataclass(frozen=True)
class SemanticCalibrationParameters:
    """A shrunk affine calibration for one semantic class."""

    class_id: int
    scale: float
    offset: float
    sample_count: int
    residual_mae: float
    residual_rmse: float


@dataclass(frozen=True)
class SureCalibration:
    """Global plus class-conditioned calibration parameters."""

    global_calibration: CalibrationResult
    class_calibrations: Mapping[int, SemanticCalibrationParameters]
    shrinkage: float
    min_class_samples: int

    @classmethod
    def from_dict(cls, payload: Mapping[str, object]) -> "SureCalibration":
        """Reconstruct a calibration artifact written by :meth:`to_dict`."""

        try:
            global_calibration = CalibrationResult(**payload["global_calibration"])
            raw_classes = payload["class_calibrations"]
            class_calibrations = {
                int(class_id): SemanticCalibrationParameters(**parameters)
                for class_id, parameters in raw_classes.items()
            }
            return cls(
                global_calibration=global_calibration,
                class_calibrations=class_calibrations,
                shrinkage=float(payload["shrinkage"]),
                min_class_samples=int(payload["min_class_samples"]),
            )
        except (KeyError, TypeError, AttributeError, ValueError) as exc:
            raise SureCalibrationError("Invalid SURE-Cal calibration artifact.") from exc

    def apply_class_conditioned(
        self,
        relative: np.ndarray,
        semantic: np.ndarray,
    ) -> np.ndarray:
        """Apply class-specific calibration to labels or class probabilities.

        ``semantic`` may be an integer label raster with shape ``relative.shape``
        or probabilities shaped ``relative.shape + (classes,)``. Missing or
        unknown classes fall back to the global calibration.
        """

        values = np.asarray(relative, dtype=float)
        semantic_array = np.asarray(semantic)
        global_values = self.global_calibration.apply(values)

        if semantic_array.shape == values.shape:
            result = global_values.copy()
            for class_id, parameters in self.class_calibrations.items():
                mask = semantic_array == class_id
                if np.any(mask):
                    result[mask] = parameters.scale * values[mask] + parameters.offset
            return result

        if semantic_array.ndim != values.ndim + 1 or semantic_array.shape[:-1] != values.shape:
            raise SureCalibrationError(
                "Semantic labels must match relative shape, or probabilities "
                "must have shape relative.shape + (classes,)."
            )

        probabilities = np.asarray(semantic_array, dtype=float)
        if np.any(probabilities < 0) or not np.all(np.isfinite(probabilities)):
            raise SureCalibrationError("Semantic probabilities must be finite and non-negative.")
        probability_sum = probabilities.sum(axis=-1, keepdims=True)
        valid = probability_sum[..., 0] > np.finfo(float).eps
        normalized = np.divide(
            probabilities,
            np.maximum(probability_sum, np.finfo(float).eps),
        )
        result = global_values.copy()
        for class_id, parameters in self.class_calibrations.items():
            if class_id < normalized.shape[-1]:
                class_values = parameters.scale * values + parameters.offset
                result = result + normalized[..., class_id] * (class_values - global_values)
        return np.where(valid, result, global_values)

    def apply(
        self,
        relative: np.ndarray,
        semantic: np.ndarray,
        *,
        uncertainty: np.ndarray | None = None,
        uncertainty_temperature: float = 1.0,
    ) -> np.ndarray:
        """Apply SURE-Cal with uncertainty-gated semantic residuals.

        Uncertainty is expected to be non-negative. The semantic residual is
        weighted by ``exp(-uncertainty / temperature)``. Thus uncertain pixels
        smoothly return to the robust global calibration.
        """

        if uncertainty_temperature <= 0:
            raise SureCalibrationError("uncertainty_temperature must be positive.")
        values = np.asarray(relative, dtype=float)
        semantic_values = self.apply_class_conditioned(values, semantic)
        global_values = self.global_calibration.apply(values)
        if uncertainty is None:
            return semantic_values
        uncertainty_values = np.asarray(uncertainty, dtype=float)
        if uncertainty_values.shape != values.shape:
            raise SureCalibrationError("Uncertainty must have the same shape as relative.")
        if np.any(~np.isfinite(uncertainty_values)) or np.any(uncertainty_values < 0):
            raise SureCalibrationError("Uncertainty must be finite and non-negative.")
        gate = np.exp(-uncertainty_values / uncertainty_temperature)
        return global_values + gate * (semantic_values - global_values)

    def calibration_uncertainty(self, semantic: np.ndarray) -> np.ndarray:
        """Return class-conditioned residual RMSE as a conservative signal.

        This is aleatoric/calibration uncertainty, not a probability guarantee.
        It is useful before a learned semantic predictor and TTA ensemble exist.
        """

        labels = np.asarray(semantic)
        if labels.ndim == 0:
            raise SureCalibrationError("Semantic labels must be an array.")
        if labels.ndim >= 3 and labels.shape[-1] > 1 and not np.issubdtype(labels.dtype, np.integer):
            probabilities = labels.astype(np.float32, copy=False)
            if np.any(probabilities < 0) or not np.all(np.isfinite(probabilities)):
                raise SureCalibrationError("Semantic probabilities must be finite and non-negative.")
            totals = probabilities.sum(axis=-1, keepdims=True)
            if np.any(totals <= np.finfo(float).eps):
                raise SureCalibrationError("Each probability vector must have positive mass.")
            normalized = np.empty_like(probabilities)
            np.divide(probabilities, totals, out=normalized)
            values = np.zeros(labels.shape[:-1], dtype=np.float32)
            fallback = self.global_calibration.residual_rmse
            values[...] = fallback
            for class_id, parameters in self.class_calibrations.items():
                if class_id < normalized.shape[-1]:
                    values += normalized[..., class_id] * (
                        parameters.residual_rmse - fallback
                    )
            return np.maximum(values, 0.0)

        values = np.full(labels.shape, self.global_calibration.residual_rmse, dtype=float)
        for class_id, parameters in self.class_calibrations.items():
            values[labels == class_id] = parameters.residual_rmse
        return values

    def to_dict(self) -> dict[str, object]:
        """Serialize parameters for experiment provenance."""

        return {
            "global_calibration": asdict(self.global_calibration),
            "class_calibrations": {
                str(class_id): asdict(parameters)
                for class_id, parameters in self.class_calibrations.items()
            },
            "shrinkage": self.shrinkage,
            "min_class_samples": self.min_class_samples,
        }


def _validate_arrays(relative: np.ndarray, reference: np.ndarray, semantic: np.ndarray) -> None:
    if relative.shape != reference.shape or relative.shape != semantic.shape:
        raise SureCalibrationError("Relative, reference, and semantic arrays must match.")


def fit_sure_calibration(
    relative: np.ndarray,
    reference: np.ndarray,
    semantic: np.ndarray,
    *,
    shrinkage: float = 64.0,
    min_class_samples: int = 32,
) -> SureCalibration:
    """Fit global and shrunk class-conditioned affine calibrations.

    The global fit is the safety anchor. Each class fit is blended toward it
    according to ``n / (n + shrinkage)``; this is important for GAMUS's
    long-tailed class distribution and avoids overfitting rare classes.
    """

    if shrinkage < 0:
        raise SureCalibrationError("shrinkage must be non-negative.")
    if min_class_samples < 2:
        raise SureCalibrationError("min_class_samples must be at least 2.")
    relative_values = np.asarray(relative, dtype=float)
    reference_values = np.asarray(reference, dtype=float)
    semantic_values = np.asarray(semantic)
    _validate_arrays(relative_values, reference_values, semantic_values)
    valid = np.isfinite(relative_values) & np.isfinite(reference_values)
    if not np.any(valid):
        raise SureCalibrationError("No finite calibration observations exist.")

    global_calibration = fit_affine(
        relative_values[valid],
        reference_values[valid],
        robust=True,
    )
    class_calibrations: dict[int, SemanticCalibrationParameters] = {}
    for raw_class_id in np.unique(semantic_values[valid]):
        if not np.isfinite(raw_class_id):
            continue
        class_id = int(raw_class_id)
        class_mask = valid & (semantic_values == class_id)
        sample_count = int(np.count_nonzero(class_mask))
        if sample_count < min_class_samples:
            continue
        try:
            class_fit = fit_affine(
                relative_values[class_mask],
                reference_values[class_mask],
                robust=True,
            )
        except CalibrationError:
            continue
        weight = sample_count / (sample_count + shrinkage)
        scale = global_calibration.scale + weight * (
            class_fit.scale - global_calibration.scale
        )
        offset = global_calibration.offset + weight * (
            class_fit.offset - global_calibration.offset
        )
        residuals = reference_values[class_mask] - (
            scale * relative_values[class_mask] + offset
        )
        class_calibrations[class_id] = SemanticCalibrationParameters(
            class_id=class_id,
            scale=float(scale),
            offset=float(offset),
            sample_count=sample_count,
            residual_mae=float(np.mean(np.abs(residuals))),
            residual_rmse=float(np.sqrt(np.mean(residuals**2))),
        )

    return SureCalibration(
        global_calibration=global_calibration,
        class_calibrations=class_calibrations,
        shrinkage=float(shrinkage),
        min_class_samples=int(min_class_samples),
    )


def aggregate_tta(relative_predictions: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return mean and standard deviation from test-time predictions.

    Input shape is ``(augmentations, ...)``. The standard deviation is a
    model-instability signal and is not claimed to be a complete probabilistic
    uncertainty estimate.
    """

    predictions = np.asarray(relative_predictions, dtype=float)
    if predictions.ndim < 2 or predictions.shape[0] < 2:
        raise SureCalibrationError("At least two test-time predictions are required.")
    if not np.all(np.isfinite(predictions)):
        raise SureCalibrationError("TTA predictions must be finite.")
    return predictions.mean(axis=0), predictions.std(axis=0)


def semantic_entropy(probabilities: np.ndarray) -> np.ndarray:
    """Compute normalized Shannon entropy for class probabilities."""

    values = np.asarray(probabilities, dtype=float)
    if values.ndim < 2 or np.any(values < 0) or not np.all(np.isfinite(values)):
        raise SureCalibrationError("Probabilities must be finite and non-negative.")
    totals = values.sum(axis=-1, keepdims=True)
    if np.any(totals <= np.finfo(float).eps):
        raise SureCalibrationError("Each probability vector must have positive mass.")
    normalized = values / totals
    entropy = -np.sum(
        normalized * np.log(np.maximum(normalized, np.finfo(float).tiny)),
        axis=-1,
    )
    class_count = values.shape[-1]
    return entropy / np.log(max(class_count, 2))
