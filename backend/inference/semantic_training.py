"""Train a lightweight GAMUS semantic head while freezing the depth model."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np

from backend.data.dataset import GamusPatchDataset
from backend.data.splits import load_scene_split
from backend.inference.training import (
    SemanticAuxiliaryHead,
    TrainingDependencyError,
    _prepare_batch,
)


@dataclass(frozen=True)
class SemanticHeadTrainingConfig:
    """Configuration for frozen-backbone semantic training."""

    model_id: str = "depth-anything/Depth-Anything-V2-Small-hf"
    patch_size: int = 256
    patches_per_scene: int = 2
    batch_size: int = 1
    epochs: int = 3
    learning_rate: float = 1e-3
    seed: int = 42
    semantic_classes: int = 7
    device: str | None = None
    train_scene_limit: int | None = None
    validation_scene_limit: int | None = None


@dataclass(frozen=True)
class SemanticHeadTrainingResult:
    """Summary of semantic-head training."""

    best_validation_loss: float
    validation_accuracy: float
    epochs_completed: int
    checkpoint_path: Path


def _semantic_loss(logits: Any, target: Any) -> Any:
    import torch.nn.functional as functional

    return functional.cross_entropy(logits, target.long())


def train_semantic_head(
    dataset_root: str | Path,
    split_manifest: str | Path,
    depth_checkpoint_path: str | Path,
    semantic_checkpoint_path: str | Path,
    *,
    config: SemanticHeadTrainingConfig | None = None,
) -> SemanticHeadTrainingResult:
    """Fit a semantic head on top of frozen, GAMUS-fine-tuned features."""

    try:
        import torch
        from torch.utils.data import DataLoader
        from transformers import AutoImageProcessor, AutoModelForDepthEstimation
    except ImportError as exc:
        raise TrainingDependencyError(
            "Semantic-head training requires torch and transformers."
        ) from exc

    settings = config or SemanticHeadTrainingConfig()
    if settings.epochs < 1 or settings.batch_size < 1:
        raise ValueError("epochs and batch_size must be positive.")
    if settings.learning_rate <= 0:
        raise ValueError("learning_rate must be positive.")
    torch.manual_seed(settings.seed)
    device = torch.device(
        settings.device or ("cuda" if torch.cuda.is_available() else "cpu")
    )
    scene_split = load_scene_split(split_manifest)
    train_ids = list(scene_split.train)
    validation_ids = list(scene_split.validation)
    if settings.train_scene_limit is not None:
        train_ids = train_ids[: settings.train_scene_limit]
    if settings.validation_scene_limit is not None:
        validation_ids = validation_ids[: settings.validation_scene_limit]
    train_dataset = GamusPatchDataset(
        dataset_root,
        "train",
        patch_size=settings.patch_size,
        patches_per_scene=settings.patches_per_scene,
        seed=settings.seed,
        scene_ids=train_ids,
    )
    validation_dataset = GamusPatchDataset(
        dataset_root,
        "train",
        patch_size=settings.patch_size,
        patches_per_scene=settings.patches_per_scene,
        seed=settings.seed,
        scene_ids=validation_ids,
    )
    train_loader = DataLoader(
        train_dataset,
        batch_size=settings.batch_size,
        shuffle=True,
        num_workers=0,
        collate_fn=lambda batch: batch,
    )
    validation_loader = DataLoader(
        validation_dataset,
        batch_size=settings.batch_size,
        shuffle=False,
        num_workers=0,
        collate_fn=lambda batch: batch,
    )

    processor = AutoImageProcessor.from_pretrained(settings.model_id)
    model = AutoModelForDepthEstimation.from_pretrained(settings.model_id).to(device)
    depth_checkpoint = torch.load(depth_checkpoint_path, map_location=device)
    model.load_state_dict(depth_checkpoint["model_state_dict"])
    model.eval()
    for parameter in model.parameters():
        parameter.requires_grad = False
    hidden_size = int(model.config.backbone_config.hidden_size)
    semantic_head = SemanticAuxiliaryHead(
        hidden_size,
        num_classes=settings.semantic_classes,
    ).to(device)
    optimizer = torch.optim.AdamW(
        semantic_head.parameters(),
        lr=settings.learning_rate,
    )
    destination = Path(semantic_checkpoint_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    best_validation_loss = float("inf")
    best_accuracy = 0.0
    epochs_completed = 0

    for epoch in range(settings.epochs):
        semantic_head.train()
        for batch_index, batch in enumerate(train_loader, start=1):
            inputs, _, _, semantic_target = _prepare_batch(
                processor,
                batch,
                device,
                settings.patch_size,
            )
            optimizer.zero_grad(set_to_none=True)
            with torch.no_grad():
                outputs = model(**inputs, output_hidden_states=True)
            logits = semantic_head(outputs.hidden_states)
            logits = torch.nn.functional.interpolate(
                logits,
                size=semantic_target.shape[-2:],
                mode="bilinear",
                align_corners=False,
            )
            loss = _semantic_loss(logits, semantic_target)
            loss.backward()
            optimizer.step()
            if batch_index % 250 == 0:
                print(
                    f"semantic epoch {epoch + 1}/{settings.epochs}: "
                    f"train batch {batch_index}/{len(train_loader)}",
                    flush=True,
                )

        semantic_head.eval()
        validation_losses: list[float] = []
        correct = 0
        total = 0
        with torch.no_grad():
            for batch in validation_loader:
                inputs, _, _, semantic_target = _prepare_batch(
                    processor,
                    batch,
                    device,
                    settings.patch_size,
                )
                outputs = model(**inputs, output_hidden_states=True)
                logits = semantic_head(outputs.hidden_states)
                logits = torch.nn.functional.interpolate(
                    logits,
                    size=semantic_target.shape[-2:],
                    mode="bilinear",
                    align_corners=False,
                )
                validation_losses.append(float(_semantic_loss(logits, semantic_target).cpu()))
                predicted = logits.argmax(dim=1)
                correct += int((predicted == semantic_target).sum().cpu())
                total += int(semantic_target.numel())
        if not validation_losses:
            raise RuntimeError("Semantic training produced no validation batches.")
        validation_loss = float(np.mean(validation_losses))
        accuracy = correct / max(total, 1)
        epochs_completed += 1
        if validation_loss < best_validation_loss:
            best_validation_loss = validation_loss
            best_accuracy = accuracy
            torch.save(
                {
                    "semantic_head_state_dict": semantic_head.state_dict(),
                    "depth_checkpoint_path": str(depth_checkpoint_path),
                    "config": asdict(settings),
                },
                destination,
            )
        print(
            f"semantic epoch {epoch + 1}/{settings.epochs}: "
            f"val_loss={validation_loss:.6f} accuracy={accuracy:.4f}",
            flush=True,
        )

    return SemanticHeadTrainingResult(
        best_validation_loss=best_validation_loss,
        validation_accuracy=best_accuracy,
        epochs_completed=epochs_completed,
        checkpoint_path=destination,
    )
