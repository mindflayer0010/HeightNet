"""Held-out GAMUS evaluation for a trained relative-depth model."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import gc
import json
from pathlib import Path

import numpy as np

from backend.data.dataset import GamusH5Dataset
from backend.data.splits import load_scene_split
from backend.geo.calibration import CalibrationResult, fit_affine
from backend.evaluation.metrics import compute_metrics
from backend.inference.depth_anything import DepthAnythingV2Estimator


@dataclass(frozen=True)
class SceneEvaluation:
    split: str
    scene_id: str
    raw_correlation: float
    mae_m: float
    rmse_m: float
    r2: float | None
    sample_count: int


def _scene_id(sample) -> str:
    return sample.paths.rgb.name.removesuffix("_RGB.h5")


def _correlation(left: np.ndarray, right: np.ndarray) -> float:
    valid = np.isfinite(left) & np.isfinite(right)
    return float(np.corrcoef(left[valid], right[valid])[0, 1])


def _fit_train_calibration(
    dataset_root: str | Path,
    scene_split,
    estimator: DepthAnythingV2Estimator,
    *,
    calibration_stride: int,
    calibration_sample_limit: int = 500_000,
    calibration_scene_limit: int | None = 256,
) -> CalibrationResult:
    """Fit the metric affine mapping using training scenes only."""

    if calibration_sample_limit < 2:
        raise ValueError("calibration_sample_limit must be at least 2.")
    if calibration_scene_limit is not None and calibration_scene_limit < 1:
        raise ValueError("calibration_scene_limit must be positive when provided.")

    calibration_relative = []
    calibration_reference = []
    train_scene_ids = scene_split.train
    if calibration_scene_limit is not None:
        train_scene_ids = train_scene_ids[:calibration_scene_limit]
    train_dataset = GamusH5Dataset(
        dataset_root,
        "train",
        scene_ids=train_scene_ids,
    )
    per_scene_limit = max(1, calibration_sample_limit // len(train_dataset))
    for index in range(len(train_dataset)):
        sample = train_dataset[index]
        prediction = estimator.predict(sample.image).relative_depth.reshape(-1)
        reference = sample.height.reshape(-1)
        adaptive_stride = max(
            calibration_stride,
            int(np.ceil(prediction.size / per_scene_limit)),
        )
        # Keep only compact samples; a view would retain the complete scene
        # and eventually exhaust RAM on the full GAMUS split.
        calibration_relative.append(prediction[::adaptive_stride].copy())
        calibration_reference.append(reference[::adaptive_stride].copy())
        del sample, prediction, reference
        if index % 25 == 0:
            gc.collect()
    return fit_affine(
        np.concatenate(calibration_relative),
        np.concatenate(calibration_reference),
        robust=True,
    )


def evaluate_checkpoint(
    dataset_root: str | Path,
    split_manifest: str | Path,
    checkpoint_path: str | Path,
    *,
    calibration_stride: int = 100,
    calibration_sample_limit: int = 500_000,
    calibration_scene_limit: int | None = 256,
) -> tuple[CalibrationResult, tuple[SceneEvaluation, ...]]:
    """Evaluate validation and test scenes using train-only calibration."""

    if calibration_stride < 1:
        raise ValueError("calibration_stride must be positive.")
    scene_split = load_scene_split(split_manifest)
    estimator = DepthAnythingV2Estimator(checkpoint_path=checkpoint_path)
    calibration = _fit_train_calibration(
        dataset_root,
        scene_split,
        estimator,
        calibration_stride=calibration_stride,
        calibration_sample_limit=calibration_sample_limit,
        calibration_scene_limit=calibration_scene_limit,
    )

    results = []
    for split_name, scene_ids in (
        ("validation", scene_split.validation),
        ("test", scene_split.test),
    ):
        dataset = GamusH5Dataset(dataset_root, "train", scene_ids=scene_ids)
        for index in range(len(dataset)):
            sample = dataset[index]
            prediction = estimator.predict(sample.image).relative_depth.reshape(-1)
            reference = sample.height.reshape(-1)
            metric_values = compute_metrics(calibration.apply(prediction), reference)
            results.append(
                SceneEvaluation(
                    split=split_name,
                    scene_id=_scene_id(sample),
                    raw_correlation=_correlation(prediction, reference),
                    mae_m=metric_values.mae,
                    rmse_m=metric_values.rmse,
                    r2=metric_values.r2,
                    sample_count=metric_values.sample_count,
                )
            )
            del sample, prediction, reference, metric_values
            if index % 25 == 0:
                gc.collect()
    return calibration, tuple(results)


def write_evaluation_report(
    path: str | Path,
    *,
    model_id: str,
    checkpoint_path: str | Path,
    calibration: CalibrationResult,
    results: tuple[SceneEvaluation, ...],
) -> Path:
    """Write evaluation results with calibration provenance."""

    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(
            {
                "model_id": model_id,
                "checkpoint_path": str(checkpoint_path),
                "calibration": asdict(calibration),
                "calibration_source": "training_scenes_only",
                "results": [asdict(result) for result in results],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return destination
