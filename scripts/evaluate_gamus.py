"""Generate a train-calibrated held-out GAMUS evaluation report."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.evaluation.gamus_report import evaluate_checkpoint, write_evaluation_report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-root", default="data/gamus_raw")
    parser.add_argument("--split-manifest", default="configs/gamus_scene_split.json")
    parser.add_argument(
        "--checkpoint",
        default="data/gamus_raw/checkpoints/depth_anything_v2_gamus.pt",
    )
    parser.add_argument("--output", default="reports/gamus_depth_anything_eval.json")
    parser.add_argument("--calibration-sample-limit", type=int, default=500_000)
    parser.add_argument("--calibration-scene-limit", type=int, default=256)
    args = parser.parse_args()

    calibration, results = evaluate_checkpoint(
        args.dataset_root,
        args.split_manifest,
        args.checkpoint,
        calibration_sample_limit=args.calibration_sample_limit,
        calibration_scene_limit=args.calibration_scene_limit,
    )
    report = write_evaluation_report(
        args.output,
        model_id="depth-anything/Depth-Anything-V2-Small-hf",
        checkpoint_path=args.checkpoint,
        calibration=calibration,
        results=results,
    )
    print(f"calibration scale: {calibration.scale:.6f}")
    print(f"calibration offset: {calibration.offset:.6f}")
    for result in results:
        print(
            f"{result.split}/{result.scene_id}: "
            f"MAE={result.mae_m:.3f}m "
            f"RMSE={result.rmse_m:.3f}m "
            f"R2={result.r2 if result.r2 is not None else 'undefined'}"
        )
    print(f"report: {report}")


if __name__ == "__main__":
    main()
