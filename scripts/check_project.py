"""Check whether a local HeightNet setup is ready for a run."""

from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.pipeline import describe_input


ROOT = Path(__file__).resolve().parents[1]


def _check_package(name: str) -> tuple[str, str]:
    if importlib.util.find_spec(name) is None:
        return "WARNING", f"Python package missing: {name}"
    return "OK", f"Python package found: {name}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path)
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=Path("data/gamus_raw/checkpoints/depth_anything_v2_gamus_fulltrain_epoch3_stable.pt"),
    )
    parser.add_argument("--output-dir", type=Path, default=Path("data/pipeline_outputs"))
    parser.add_argument("--ground", type=Path)
    args = parser.parse_args()

    errors = 0
    expected_dirs = [
        "backend",
        "scripts",
        "portal",
        "data/inputs",
        "data/outputs",
        "data/checkpoints",
    ]
    for relative in expected_dirs:
        path = ROOT / relative
        if path.is_dir():
            print(f"OK: folder found: {relative}")
        else:
            print(f"ERROR: folder missing: {relative}")
            errors += 1

    for package in ("numpy", "rasterio", "h5py"):
        level, message = _check_package(package)
        print(f"{level}: {message}")

    checkpoint = args.checkpoint if args.checkpoint.is_absolute() else ROOT / args.checkpoint
    if checkpoint.is_file():
        print(f"OK: checkpoint found: {checkpoint}")
    else:
        print(f"WARNING: checkpoint missing: {checkpoint}")

    output_dir = args.output_dir if args.output_dir.is_absolute() else ROOT / args.output_dir
    try:
        output_dir.mkdir(parents=True, exist_ok=True)
        probe = output_dir / ".heightnet_write_test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
        print(f"OK: output folder is writable: {output_dir}")
    except OSError as exc:
        print(f"ERROR: output folder is not writable: {exc}")
        errors += 1

    if args.input:
        input_path = args.input if args.input.is_absolute() else ROOT / args.input
        try:
            description = describe_input(input_path)
            print(
                f"OK: input is {description.kind.value}, "
                f"{description.width}x{description.height}, CRS={description.crs or 'none'}"
            )
        except Exception as exc:
            print(f"ERROR: input check failed: {exc}")
            errors += 1

    if args.ground:
        ground = args.ground if args.ground.is_absolute() else ROOT / args.ground
        if ground.is_file():
            print(f"OK: ground raster found: {ground}")
        else:
            print(f"ERROR: ground raster missing: {ground}")
            errors += 1

    if errors:
        print(f"\nProject check finished with {errors} error(s).")
        return 1
    print("\nProject check finished without errors.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
