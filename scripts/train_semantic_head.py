"""Train a semantic head over the frozen fine-tuned Depth Anything encoder."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.inference.semantic_training import (
    SemanticHeadTrainingConfig,
    train_semantic_head,
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-root", default="data/gamus_raw")
    parser.add_argument("--split-manifest", default="configs/gamus_scene_split_fulltrain.json")
    parser.add_argument(
        "--depth-checkpoint",
        default="data/gamus_raw/checkpoints/depth_anything_v2_gamus_fulltrain_epoch3_stable.pt",
    )
    parser.add_argument(
        "--semantic-checkpoint",
        default="data/gamus_raw/checkpoints/gamus_semantic_head.pt",
    )
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--patch-size", type=int, default=256)
    parser.add_argument("--patches-per-scene", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--train-scene-limit", type=int, default=None)
    parser.add_argument("--validation-scene-limit", type=int, default=None)
    args = parser.parse_args()
    result = train_semantic_head(
        args.dataset_root,
        args.split_manifest,
        args.depth_checkpoint,
        args.semantic_checkpoint,
        config=SemanticHeadTrainingConfig(
            epochs=args.epochs,
            patch_size=args.patch_size,
            patches_per_scene=args.patches_per_scene,
            batch_size=args.batch_size,
            learning_rate=args.learning_rate,
            train_scene_limit=args.train_scene_limit,
            validation_scene_limit=args.validation_scene_limit,
        ),
    )
    print(f"epochs completed: {result.epochs_completed}")
    print(f"best validation loss: {result.best_validation_loss:.6f}")
    print(f"validation pixel accuracy: {result.validation_accuracy:.4f}")
    print(f"checkpoint: {result.checkpoint_path}")


if __name__ == "__main__":
    main()
