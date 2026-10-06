"""Conservative scene-risk checks for difficult single-view RGB inputs.

RGB alone cannot reveal every hidden height. Waterfalls, roofs, shadows,
reflective glass, canopy, and tunnels can all look plausible from above. This
module therefore does not invent geometry. It measures visible warning signs,
creates a per-pixel risk map, and lets the calibration layer lean back toward
its robust global fit when the image is ambiguous.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np


@dataclass(frozen=True)
class SceneQualityAssessment:
    """Scene-wide and pixel-wise ambiguity information."""

    risk_map: np.ndarray
    risk_score: float
    features: dict[str, float]
    flags: tuple[str, ...]

    @property
    def recommended_action(self) -> str:
        if self.risk_score >= 0.45:
            return "Use global calibration strongly and review the risk map before claiming height accuracy."
        if self.risk_score >= 0.25:
            return "Blend class calibration with the global fallback and review flagged regions."
        return "Normal class-aware calibration can be used, subject to independent validation."

    def to_dict(self) -> dict[str, Any]:
        return {
            "risk_score": self.risk_score,
            "features": self.features,
            "flags": list(self.flags),
            "recommended_action": self.recommended_action,
        }


def _robust_rgb(rgb: np.ndarray) -> np.ndarray:
    values = np.asarray(rgb, dtype=np.float32)
    if values.ndim != 3 or values.shape[-1] != 3:
        raise ValueError("RGB input must have shape (height, width, 3).")
    if not np.all(np.isfinite(values)):
        raise ValueError("RGB input must contain only finite values.")

    output = np.empty_like(values, dtype=np.float32)
    for channel in range(3):
        band = values[..., channel]
        low, high = np.percentile(band, (2.0, 98.0))
        if high <= low:
            if high <= 0:
                output[..., channel] = 0.0
            elif low >= 1:
                output[..., channel] = 1.0
            else:
                output[..., channel] = 0.5
        else:
            output[..., channel] = np.clip((band - low) / (high - low), 0.0, 1.0)
    return output


def _semantic_entropy(probabilities: np.ndarray | None, shape: tuple[int, int]) -> np.ndarray:
    if probabilities is None:
        return np.zeros(shape, dtype=np.float32)
    values = np.asarray(probabilities, dtype=np.float32)
    if values.ndim != 3 or values.shape[:2] != shape:
        raise ValueError("Semantic probabilities must have shape (height, width, classes).")
    totals = values.sum(axis=-1, keepdims=True)
    normalized = values / np.maximum(totals, np.finfo(np.float32).eps)
    entropy = -np.sum(
        normalized * np.log(np.maximum(normalized, np.finfo(np.float32).tiny)),
        axis=-1,
    )
    return np.clip(entropy / np.log(max(values.shape[-1], 2)), 0.0, 1.0)


def assess_scene(
    rgb: np.ndarray,
    semantic_probabilities: np.ndarray | None = None,
) -> SceneQualityAssessment:
    """Assess visible ambiguity without claiming to solve hidden geometry.

    The risk map is intentionally conservative. Low local texture, clipped or
    very dark/bright pixels, and uncertain semantic predictions reduce the
    influence of class-specific calibration. This covers a common failure
    family across water, flat land, shadows, snow, glass, canopy, and dense
    structures without hard-coding one detector per object type.
    """

    normalized = _robust_rgb(rgb)
    height, width = normalized.shape[:2]
    brightness = normalized.mean(axis=-1)
    saturation = normalized.max(axis=-1) - normalized.min(axis=-1)

    gradient = np.zeros((height, width), dtype=np.float32)
    gradient[:, 1:] += np.mean(np.abs(normalized[:, 1:] - normalized[:, :-1]), axis=-1)
    gradient[1:, :] += np.mean(np.abs(normalized[1:, :] - normalized[:-1, :]), axis=-1)
    texture_scale = max(float(np.percentile(gradient, 95)), 1e-4)
    texture_strength = np.clip(gradient / texture_scale, 0.0, 1.0)
    low_texture = 1.0 - texture_strength
    dark = (brightness < 0.12).astype(np.float32)
    bright = (brightness > 0.88).astype(np.float32)
    clipped = (
        (normalized <= 0.01).any(axis=-1) | (normalized >= 0.99).any(axis=-1)
    ).astype(np.float32)
    entropy = _semantic_entropy(semantic_probabilities, (height, width))

    risk_map = np.clip(
        0.45 * low_texture
        + 0.20 * clipped
        + 0.15 * dark
        + 0.10 * bright
        + 0.10 * entropy,
        0.0,
        1.0,
    ).astype(np.float32)

    features = {
        "mean_brightness": float(np.mean(brightness)),
        "mean_saturation": float(np.mean(saturation)),
        "mean_texture_strength": float(np.mean(texture_strength)),
        "low_texture_fraction": float(np.mean(low_texture > 0.75)),
        "dark_fraction": float(np.mean(dark)),
        "bright_fraction": float(np.mean(bright)),
        "clipped_fraction": float(np.mean(clipped)),
        "semantic_entropy_mean": float(np.mean(entropy)),
    }
    flags: list[str] = []
    if features["low_texture_fraction"] >= 0.45:
        flags.append("low_texture_or_flat_surface")
    if features["low_texture_fraction"] >= 0.60 and features["mean_saturation"] < 0.35:
        flags.append("possible_water_or_uniform_ground")
    if features["dark_fraction"] >= 0.15:
        flags.append("possible_shadow_or_occlusion")
    if features["bright_fraction"] >= 0.20:
        flags.append("possible_snow_cloud_or_reflective_surface")
    if features["clipped_fraction"] >= 0.03:
        flags.append("possible_sensor_clipping_or_glare")
    if features["semantic_entropy_mean"] >= 0.55:
        flags.append("semantic_prediction_ambiguous")

    return SceneQualityAssessment(
        risk_map=risk_map,
        risk_score=float(np.mean(risk_map)),
        features=features,
        flags=tuple(flags),
    )
