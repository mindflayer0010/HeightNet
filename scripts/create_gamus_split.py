"""Create a deterministic scene-level split from complete local GAMUS triplets."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.data.splits import split_scene_ids, write_scene_split


def complete_scene_ids(dataset_root: str | Path, split: str) -> list[str]:
    """Return local scene IDs that have RGB, AGL, and CLS files."""

    root = Path(dataset_root)
    rgb_dir = root / "images" / split
    scene_ids = []
    for rgb_path in sorted(rgb_dir.glob("*_RGB.h5")):
        scene_id = rgb_path.name.removesuffix("_RGB.h5")
        if (
            (root / "heights" / split / f"{scene_id}_AGL.h5").is_file()
            and (root / "classes" / split / f"{scene_id}_CLS.h5").is_file()
        ):
            scene_ids.append(scene_id)
    return scene_ids


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-root", default="data/gamus_raw")
    parser.add_argument("--split", default="train")
    parser.add_argument("--output", default="configs/gamus_scene_split_146.json")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--validation-fraction", type=float, default=0.15)
    parser.add_argument("--test-fraction", type=float, default=0.15)
    args = parser.parse_args()

    scene_ids = complete_scene_ids(args.dataset_root, args.split)
    if len(scene_ids) < 3:
        raise RuntimeError("At least three complete GAMUS scenes are required.")
    scene_split = split_scene_ids(
        scene_ids,
        seed=args.seed,
        validation_fraction=args.validation_fraction,
        test_fraction=args.test_fraction,
    )
    output = write_scene_split(args.output, scene_split, seed=args.seed)
    print(
        f"scenes={len(scene_ids)} train={len(scene_split.train)} "
        f"validation={len(scene_split.validation)} test={len(scene_split.test)}"
    )
    print(f"manifest: {output}")


if __name__ == "__main__":
    main()
