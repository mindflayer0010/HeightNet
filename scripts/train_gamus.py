"""Fine-tune Depth Anything V2 on the configured GAMUS scene split."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.inference.training import TrainingConfig, train_gamus


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--patch-size", type=int, default=256)
    parser.add_argument("--patches-per-scene", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--learning-rate", type=float, default=1e-5)
    parser.add_argument("--dataset-root", default="data/gamus_raw")
    parser.add_argument("--split-manifest", default="configs/gamus_scene_split.json")
    parser.add_argument(
        "--checkpoint",
        default="data/gamus_raw/checkpoints/depth_anything_v2_gamus.pt",
    )
    parser.add_argument(
        "--unfreeze-backbone",
        action="store_true",
        help="Fine-tune the full model; requires more GPU memory.",
    )
    parser.add_argument(
        "--height-aware-patches",
        action="store_true",
        help="Prefer training patches with valid height variation.",
    )
    parser.add_argument(
        "--focus-classes",
        type=int,
        nargs="*",
        default=[],
        help="Prefer patches containing these GAMUS class IDs.",
    )
    parser.add_argument("--min-focus-fraction", type=float, default=0.1)
    parser.add_argument(
        "--multitask",
        action="store_true",
        help="Train an auxiliary semantic-classification head with depth.",
    )
    parser.add_argument("--semantic-loss-weight", type=float, default=0.2)
    parser.add_argument("--max-grad-norm", type=float, default=1.0)
    args = parser.parse_args()
    result = train_gamus(
        args.dataset_root,
        args.split_manifest,
        args.checkpoint,
        config=TrainingConfig(
            patch_size=args.patch_size,
            patches_per_scene=args.patches_per_scene,
            batch_size=args.batch_size,
            epochs=args.epochs,
            learning_rate=args.learning_rate,
            freeze_backbone=not args.unfreeze_backbone,
            height_aware_patches=args.height_aware_patches,
            focus_classes=tuple(args.focus_classes),
            min_focus_fraction=args.min_focus_fraction,
            multitask=args.multitask,
            semantic_loss_weight=args.semantic_loss_weight,
            max_grad_norm=args.max_grad_norm,
        ),
    )
    print(f"epochs completed: {result.epochs_completed}")
    print(f"final training loss: {result.final_training_loss:.6f}")
    print(f"best validation loss: {result.best_validation_loss:.6f}")
    print(f"checkpoint: {result.checkpoint_path}")


if __name__ == "__main__":
    main()
