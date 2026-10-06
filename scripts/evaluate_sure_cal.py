"""Evaluate SURE-Cal on GAMUS using oracle semantic labels.

This is an experiment, not the final deployment path: GAMUS labels are used
to measure the potential gain from semantic conditioning before a learned
semantic head is introduced. Calibration is fit on training scenes only and
the validation/test scenes remain untouched.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict
import gc
import json
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.data.dataset import GamusH5Dataset
from backend.data.splits import load_scene_split
from backend.evaluation.metrics import compute_metrics
from backend.evaluation.sure_cal import SureCalibration, fit_sure_calibration
from backend.inference.depth_anything import DepthAnythingV2Estimator
from backend.inference.semantic import GamusSemanticEstimator


def _scene_ids(split_manifest: str | Path, name: str, limit: int | None) -> list[str]:
    split = load_scene_split(split_manifest)
    values = list(getattr(split, name))
    return values if limit is None else values[:limit]


def _collect_training_calibration(
    dataset_root: str | Path,
    split_manifest: str | Path,
    estimator: DepthAnythingV2Estimator,
    *,
    scene_limit: int | None,
    stride: int,
    sample_limit: int,
    inference_batch_size: int,
    inference_size: int | None,
):
    scene_ids = _scene_ids(split_manifest, "train", scene_limit)
    dataset = GamusH5Dataset(dataset_root, "train", scene_ids=scene_ids)
    relative_values: list[np.ndarray] = []
    reference_values: list[np.ndarray] = []
    semantic_values: list[np.ndarray] = []
    per_scene_limit = max(1, sample_limit // max(len(dataset), 1))
    for start in range(0, len(dataset), inference_batch_size):
        samples = [dataset[index] for index in range(start, min(start + inference_batch_size, len(dataset)))]
        predictions = estimator.predict_batch(
            [sample.image for sample in samples],
            inference_size=inference_size,
        )
        for sample, prediction in zip(samples, predictions):
            relative = prediction.relative_depth
            adaptive_stride = max(stride, int(np.ceil(relative.size / per_scene_limit)))
            # Copy sampled values so the lists do not retain each scene's full
            # model-output/HDF5 buffers through NumPy views.
            relative_values.append(relative.reshape(-1)[::adaptive_stride].copy())
            reference_values.append(sample.height.reshape(-1)[::adaptive_stride].copy())
            semantic_values.append(sample.semantic.reshape(-1)[::adaptive_stride].copy())
        del samples, predictions
        if start % (inference_batch_size * 25) == 0:
            gc.collect()
    return fit_sure_calibration(
        np.concatenate(relative_values),
        np.concatenate(reference_values),
        np.concatenate(semantic_values),
    )


def evaluate(
    dataset_root: str | Path,
    split_manifest: str | Path,
    checkpoint_path: str | Path,
    *,
    train_scene_limit: int | None = 256,
    evaluation_scene_limit: int | None = None,
    stride: int = 100,
    sample_limit: int = 500_000,
    semantic_checkpoint_path: str | Path | None = None,
    calibration_report_path: str | Path | None = None,
    inference_batch_size: int = 4,
    inference_size: int | None = None,
) -> dict[str, object]:
    if inference_batch_size < 1:
        raise ValueError("inference_batch_size must be positive.")
    estimator = DepthAnythingV2Estimator(checkpoint_path=checkpoint_path)
    semantic_estimator = None
    semantic_source = "GAMUS oracle labels (research upper-bound experiment)"
    if semantic_checkpoint_path is not None:
        semantic_estimator = GamusSemanticEstimator(
            checkpoint_path,
            semantic_checkpoint_path,
            depth_estimator=estimator,
        )
        semantic_source = "frozen Depth Anything encoder + learned GAMUS semantic head"
    if calibration_report_path is None:
        calibration = _collect_training_calibration(
            dataset_root,
            split_manifest,
            estimator,
            scene_limit=train_scene_limit,
            stride=stride,
            sample_limit=sample_limit,
            inference_batch_size=inference_batch_size,
            inference_size=inference_size,
        )
        calibration_source = "training scenes only"
    else:
        with Path(calibration_report_path).open(encoding="utf-8") as source:
            calibration_payload = json.load(source)
        calibration = SureCalibration.from_dict(calibration_payload["calibration"])
        calibration_source = f"loaded artifact: {calibration_report_path}"
    report: dict[str, object] = {
        "method": "SURE-Cal",
        "semantic_source": semantic_source,
        "calibration_source": calibration_source,
        "calibration": calibration.to_dict(),
        "results": [],
    }
    results: list[dict[str, object]] = []
    for split_name in ("validation", "test"):
        ids = _scene_ids(split_manifest, split_name, evaluation_scene_limit)
        dataset = GamusH5Dataset(dataset_root, "train", scene_ids=ids)
        for start in range(0, len(dataset), inference_batch_size):
            samples = [dataset[index] for index in range(start, min(start + inference_batch_size, len(dataset)))]
            if semantic_estimator is not None:
                predictions = semantic_estimator.predict_depth_and_probabilities_batch(
                    [sample.image for sample in samples],
                    inference_size=inference_size,
                )
            else:
                predictions = tuple(
                    (prediction.relative_depth, sample.semantic)
                    for prediction, sample in zip(
                        estimator.predict_batch(
                            [sample.image for sample in samples],
                            inference_size=inference_size,
                        ),
                        samples,
                    )
                )
            for sample, (relative, semantic) in zip(samples, predictions):
                baseline = calibration.global_calibration.apply(relative)
                sure = calibration.apply_class_conditioned(relative, semantic)
                uncertainty = calibration.calibration_uncertainty(semantic)
                sure_uncertainty = calibration.apply(
                    relative,
                    semantic,
                    uncertainty=uncertainty,
                    uncertainty_temperature=5.0,
                )
                baseline_metrics = compute_metrics(baseline, sample.height)
                sure_metrics = compute_metrics(sure, sample.height)
                sure_uncertainty_metrics = compute_metrics(sure_uncertainty, sample.height)
                results.append(
                    {
                        "split": split_name,
                        "scene_id": sample.paths.rgb.name.removesuffix("_RGB.h5"),
                        "baseline_global_affine": asdict(baseline_metrics),
                        "sure_cal_semantic": asdict(sure_metrics),
                        "sure_cal_uncertainty_gated": asdict(sure_uncertainty_metrics),
                    }
                )
            del samples, predictions
            if start % (inference_batch_size * 25) == 0:
                gc.collect()
    report["results"] = results
    report["inference_size"] = inference_size
    for key in (
        "baseline_global_affine",
        "sure_cal_semantic",
        "sure_cal_uncertainty_gated",
    ):
        values = [result[key] for result in results]
        report.setdefault("summary", {})[key] = {
            "scene_count": len(values),
            "mean_mae_m": float(np.mean([value["mae"] for value in values])),
            "mean_rmse_m": float(np.mean([value["rmse"] for value in values])),
        }
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-root", default="data/gamus_raw")
    parser.add_argument("--split-manifest", default="configs/gamus_scene_split_fulltrain.json")
    parser.add_argument(
        "--checkpoint",
        default="data/gamus_raw/checkpoints/depth_anything_v2_gamus_fulltrain_epoch3_stable.pt",
    )
    parser.add_argument("--output", default="reports/sure_cal_semantic.json")
    parser.add_argument("--train-scene-limit", type=int, default=256)
    parser.add_argument("--evaluation-scene-limit", type=int, default=None)
    parser.add_argument("--stride", type=int, default=100)
    parser.add_argument("--sample-limit", type=int, default=500_000)
    parser.add_argument(
        "--semantic-checkpoint",
        default=None,
        help="Use a learned semantic head instead of GAMUS oracle labels.",
    )
    parser.add_argument(
        "--calibration-report",
        default=None,
        help="Reuse a previously fitted SURE-Cal artifact and skip calibration inference.",
    )
    parser.add_argument("--inference-batch-size", type=int, default=4)
    parser.add_argument("--inference-size", type=int, default=None)
    args = parser.parse_args()
    report = evaluate(
        args.dataset_root,
        args.split_manifest,
        args.checkpoint,
        train_scene_limit=args.train_scene_limit,
        evaluation_scene_limit=args.evaluation_scene_limit,
        stride=args.stride,
        sample_limit=args.sample_limit,
        semantic_checkpoint_path=args.semantic_checkpoint,
        calibration_report_path=args.calibration_report,
        inference_batch_size=args.inference_batch_size,
        inference_size=args.inference_size,
    )
    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    for result in report["results"]:
        print(
            f"{result['split']}/{result['scene_id']}: "
            f"global MAE={result['baseline_global_affine']['mae']:.3f}m, "
            f"SURE-Cal MAE={result['sure_cal_semantic']['mae']:.3f}m, "
            f"gated MAE={result['sure_cal_uncertainty_gated']['mae']:.3f}m"
        )
    print(f"report: {destination}")


if __name__ == "__main__":
    main()
