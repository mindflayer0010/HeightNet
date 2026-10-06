"""Evaluate a DSM against a reference raster and/or surveyed GCPs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.evaluation.reference import (
    compute_metrics,
    evaluate_gcp_calibration,
    load_aligned_reference,
    read_gcp_csv,
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prediction", required=True, help="Predicted DSM/AGL GeoTIFF.")
    parser.add_argument("--reference", help="Reference DSM/height GeoTIFF.")
    parser.add_argument("--gcp-csv", help="CSV with x,y,reference_m in prediction CRS.")
    parser.add_argument("--calibration-fraction", type=float, default=0.7)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", required=True, help="JSON report path.")
    args = parser.parse_args()
    if not args.reference and not args.gcp_csv:
        parser.error("Provide --reference, --gcp-csv, or both.")

    report: dict[str, object] = {"prediction": args.prediction}
    if args.reference:
        prediction, reference, alignment = load_aligned_reference(
            args.prediction, args.reference
        )
        report["reference"] = args.reference
        report["alignment"] = alignment
        report["raster_metrics"] = compute_metrics(prediction, reference).__dict__

    if args.gcp_csv:
        predicted, reference, _ = read_gcp_csv(args.prediction, args.gcp_csv)
        report["gcp_csv"] = args.gcp_csv
        report["gcp_raw_metrics"] = compute_metrics(predicted, reference).__dict__
        report["gcp_calibration"] = evaluate_gcp_calibration(
            predicted,
            reference,
            calibration_fraction=args.calibration_fraction,
            seed=args.seed,
        )

    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    print("report:", destination)


if __name__ == "__main__":
    main()
