"""Run the generic HeightNet PNG/JPG/GeoTIFF pipeline."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.geo.calibration import CalibrationResult
from backend.inference.depth_anything import DepthAnythingV2Estimator
from backend.inference.semantic import GamusSemanticEstimator
from backend.evaluation.sure_cal import SureCalibration
from backend.pipeline import run_pipeline


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument(
        "--checkpoint",
        default="data/gamus_raw/checkpoints/depth_anything_v2_gamus_fulltrain_epoch3_stable.pt",
    )
    parser.add_argument("--output-dir", default="data/pipeline_outputs")
    parser.add_argument("--output-prefix")
    parser.add_argument(
        "--calibration-report",
        help="Evaluation JSON containing a train-only affine calibration.",
    )
    parser.add_argument(
        "--ground",
        help="Optional ground-elevation GeoTIFF for composing an absolute DSM.",
    )
    parser.add_argument(
        "--sure-calibration-report",
        help="SURE-Cal JSON report containing a train-only class calibration.",
    )
    parser.add_argument(
        "--semantic-checkpoint",
        help="Learned GAMUS semantic-head checkpoint for SURE-Cal inference.",
    )
    args = parser.parse_args()
    calibration = None
    sure_calibration = None
    if args.calibration_report:
        with Path(args.calibration_report).open(encoding="utf-8") as source:
            report = json.load(source)
        calibration = CalibrationResult(**report["calibration"])
    if args.sure_calibration_report:
        if args.calibration_report:
            parser.error("Use --calibration-report or --sure-calibration-report, not both.")
        with Path(args.sure_calibration_report).open(encoding="utf-8") as source:
            report = json.load(source)
        sure_calibration = SureCalibration.from_dict(report["calibration"])
    if args.semantic_checkpoint and sure_calibration is None:
        parser.error("--semantic-checkpoint requires --sure-calibration-report.")
    estimator = DepthAnythingV2Estimator(checkpoint_path=args.checkpoint)
    semantic_estimator = None
    if args.semantic_checkpoint:
        semantic_estimator = GamusSemanticEstimator(
            args.checkpoint,
            args.semantic_checkpoint,
            depth_estimator=estimator,
        )
    result = run_pipeline(
        args.input,
        estimator=estimator,
        output_dir=args.output_dir,
        output_prefix=args.output_prefix,
        calibration=calibration,
        sure_calibration=sure_calibration,
        semantic_estimator=semantic_estimator,
        ground_path=args.ground,
    )
    print("Input kind:", result.input_kind)
    print("Metric scale:", result.metric_scale)
    print("Relative output:", result.relative_path)
    print("AGL output:", result.agl_path)
    print("DSM output:", result.dsm_path)
    print("Calibration uncertainty:", result.calibration_uncertainty_path)
    print("Calibration confidence:", result.calibration_confidence_path)
    print("Scene risk:", result.scene_risk_path)
    print("Scene quality report:", result.scene_quality_path)
    print("Metadata:", result.metadata_path)
    for warning in result.warnings:
        print("Warning:", warning)


if __name__ == "__main__":
    main()
