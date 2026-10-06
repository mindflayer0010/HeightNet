"""Validate alignment and numeric health of a generated DSM product."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np


def _stats(path: Path) -> dict[str, object]:
    import rasterio

    with rasterio.open(path) as source:
        values = source.read(1, masked=True).astype("float64")
        valid = values.compressed()
        if valid.size == 0:
            raise ValueError(f"Raster contains no valid values: {path}")
        return {
            "path": str(path),
            "shape": [source.height, source.width],
            "crs": source.crs.to_string() if source.crs else None,
            "transform": list(source.transform),
            "count": source.count,
            "dtype": source.dtypes[0],
            "nodata": source.nodata,
            "valid_fraction": float(valid.size / (source.height * source.width)),
            "min": float(valid.min()),
            "p01": float(np.percentile(valid, 1)),
            "median": float(np.median(valid)),
            "p99": float(np.percentile(valid, 99)),
            "max": float(valid.max()),
            "mean": float(valid.mean()),
            "std": float(valid.std()),
        }


def validate(input_path: str | Path, paths: dict[str, str | Path]) -> dict[str, object]:
    import rasterio

    input_path = Path(input_path)
    with rasterio.open(input_path) as reference:
        reference_grid = {
            "shape": (reference.height, reference.width),
            "crs": reference.crs,
            "transform": reference.transform,
        }

    result = {"input": str(input_path), "rasters": {}}
    for label, raw_path in paths.items():
        path = Path(raw_path)
        with rasterio.open(path) as source:
            if source.count != 1:
                raise ValueError(f"{label} must be single-band: {path}")
            if (source.height, source.width) != reference_grid["shape"]:
                raise ValueError(f"{label} is not pixel-aligned with the input: {path}")
            if source.crs != reference_grid["crs"]:
                raise ValueError(f"{label} CRS does not match the input: {path}")
            if source.transform != reference_grid["transform"]:
                raise ValueError(f"{label} transform does not match the input: {path}")
        result["rasters"][label] = _stats(path)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--agl", required=True)
    parser.add_argument("--dsm", required=True)
    parser.add_argument("--ground", required=True)
    parser.add_argument("--uncertainty")
    parser.add_argument("--confidence")
    parser.add_argument("--scene-risk")
    parser.add_argument("--output")
    args = parser.parse_args()

    paths = {"agl": args.agl, "ground": args.ground, "dsm": args.dsm}
    if args.uncertainty:
        paths["uncertainty"] = args.uncertainty
    if args.confidence:
        paths["confidence"] = args.confidence
    if args.scene_risk:
        paths["scene_risk"] = args.scene_risk
    report = validate(args.input, paths)
    text = json.dumps(report, indent=2) + "\n"
    if args.output:
        destination = Path(args.output)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(text, encoding="utf-8")
    print(text, end="")


if __name__ == "__main__":
    main()
