"""Memory-conscious fine-tuning for GAMUS aerial RGB patches."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np

from backend.data.dataset import GamusPatch, GamusPatchDataset
from backend.data.splits import load_scene_split


class TrainingDependencyError(ImportError):
    """Raised when fine-tuning dependencies are unavailable."""


try:
    import torch.nn as neural_network
except ImportError:  # pragma: no cover - exercised only without model extras
    neural_network = None


if neural_network is not None:

    class SemanticAuxiliaryHead(neural_network.Module):
        """Project final DINOv2 patch tokens into semantic class logits."""

        def __init__(self, hidden_size: int, num_classes: int = 7) -> None:
            super().__init__()
            self.classifier = neural_network.Sequential(
                neural_network.Conv2d(hidden_size, 128, kernel_size=1),
                neural_network.GELU(),
                neural_network.Conv2d(128, num_classes, kernel_size=1),
            )

        @staticmethod
        def _factor_grid(token_count: int, aspect_ratio: float | None):
            import math

            if token_count < 1:
                return None
            candidates = []
            for rows in range(1, int(math.sqrt(token_count)) + 1):
                if token_count % rows:
                    continue
                columns = token_count // rows
                for candidate in ((rows, columns), (columns, rows)):
                    candidate_ratio = candidate[0] / candidate[1]
                    score = (
                        abs(math.log(candidate_ratio / aspect_ratio))
                        if aspect_ratio and aspect_ratio > 0
                        else abs(candidate[0] - candidate[1])
                    )
                    candidates.append((score, candidate))
            return min(candidates, key=lambda item: item[0])[1] if candidates else None

        def forward(self, hidden_states, spatial_shape=None):
            tokens = hidden_states[-1]
            token_count = tokens.shape[1]
            aspect_ratio = None
            if spatial_shape is not None:
                aspect_ratio = float(spatial_shape[0]) / float(spatial_shape[1])
            grid_with_cls = self._factor_grid(token_count - 1, aspect_ratio)
            grid_without_cls = self._factor_grid(token_count, aspect_ratio)
            if grid_with_cls is not None:
                tokens = tokens[:, 1:, :]
                rows, columns = grid_with_cls
            elif grid_without_cls is not None:
                rows, columns = grid_without_cls
            else:
                raise ValueError("Semantic head requires a factorable patch-token grid.")
            features = tokens.transpose(1, 2).reshape(
                tokens.shape[0],
                tokens.shape[2],
                rows,
                columns,
            )
            return self.classifier(features)

else:

    class SemanticAuxiliaryHead:  # type: ignore[no-redef]
        """Placeholder that gives a useful error when model extras are absent."""

        def __init__(self, *args, **kwargs) -> None:
            raise TrainingDependencyError(
                "The semantic head requires torch. Install the model dependencies."
            )


@dataclass(frozen=True)
class TrainingConfig:
    """Configuration for a reproducible fine-tuning run."""

    model_id: str = "depth-anything/Depth-Anything-V2-Small-hf"
    patch_size: int = 256
    patches_per_scene: int = 2
    batch_size: int = 1
    epochs: int = 1
    learning_rate: float = 1e-5
    seed: int = 42
    freeze_backbone: bool = True
    height_aware_patches: bool = False
    focus_classes: tuple[int, ...] = ()
    min_focus_fraction: float = 0.1
    multitask: bool = False
    semantic_loss_weight: float = 0.2
    semantic_classes: int = 7
    max_grad_norm: float = 1.0
    device: str | None = None


@dataclass(frozen=True)
class TrainingResult:
    """Summary of one fine-tuning run."""

    best_validation_loss: float
    final_training_loss: float
    epochs_completed: int
    checkpoint_path: Path


def scale_invariant_l1(
    predicted: Any,
    target: Any,
    valid_mask: Any,
) -> Any:
    """Compare spatial structure while ignoring per-patch scale and offset."""

    import torch

    mask = valid_mask.bool()
    count = mask.flatten(1).sum(dim=1).clamp_min(1)
    mask_float = mask.float()
    predicted_mean = (predicted * mask_float).flatten(1).sum(dim=1) / count
    target_mean = (target * mask_float).flatten(1).sum(dim=1) / count
    predicted_centered = predicted - predicted_mean[:, None, None]
    target_centered = target - target_mean[:, None, None]
    predicted_std = (
        (predicted_centered.square() * mask_float).flatten(1).sum(dim=1) / count
    ).sqrt().clamp_min(torch.finfo(predicted.dtype).eps)
    target_std = (
        (target_centered.square() * mask_float).flatten(1).sum(dim=1) / count
    ).sqrt().clamp_min(torch.finfo(target.dtype).eps)
    difference = (
        predicted_centered / predicted_std[:, None, None]
        - target_centered / target_std[:, None, None]
    ).abs()
    return (difference * mask_float).flatten(1).sum(dim=1).div(count).mean()


def _collate_patches(batch: list[GamusPatch]):
    try:
        import torch
        from PIL import Image
    except ImportError as exc:
        raise TrainingDependencyError(
            "Fine-tuning requires torch and Pillow."
        ) from exc

    images = []
    heights = []
    masks = []
    for patch in batch:
        image = np.moveaxis(patch.image, 0, -1)
        image = np.nan_to_num(image, nan=0.0, posinf=255.0, neginf=0.0)
        images.append(Image.fromarray(np.clip(image, 0, 255).astype(np.uint8)))
        heights.append(np.nan_to_num(patch.height, nan=0.0).astype(np.float32))
        masks.append(np.isfinite(patch.height))
    return (
        images,
        torch.from_numpy(np.stack(heights)),
        torch.from_numpy(np.stack(masks)),
        torch.from_numpy(np.stack([patch.semantic for patch in batch]).astype(np.int64)),
    )


def _prepare_batch(processor, batch, device, patch_size):
    import torch

    images, heights, masks, semantic = _collate_patches(batch)
    inputs = processor(
        images=images,
        return_tensors="pt",
        do_resize=True,
        size={"height": patch_size, "width": patch_size},
    )
    inputs = {key: value.to(device) for key, value in inputs.items()}
    return inputs, heights.to(device), masks.to(device), semantic.to(device)


def _prediction_loss(model, processor, batch, device, patch_size):
    import torch.nn.functional as functional

    inputs, target, mask, _ = _prepare_batch(processor, batch, device, patch_size)
    outputs = model(**inputs)
    predicted = outputs.predicted_depth
    if predicted.ndim == 3:
        predicted = predicted.unsqueeze(1)
    predicted = functional.interpolate(
        predicted,
        size=target.shape[-2:],
        mode="bilinear",
        align_corners=False,
    ).squeeze(1)
    return scale_invariant_l1(predicted, target, mask)


def _joint_prediction_loss(
    model,
    semantic_head,
    processor,
    batch,
    device,
    patch_size,
    semantic_loss_weight,
):
    import torch.nn.functional as functional

    inputs, target, mask, semantic_target = _prepare_batch(
        processor,
        batch,
        device,
        patch_size,
    )
    outputs = model(**inputs, output_hidden_states=True)
    predicted = outputs.predicted_depth
    if predicted.ndim == 3:
        predicted = predicted.unsqueeze(1)
    predicted = functional.interpolate(
        predicted,
        size=target.shape[-2:],
        mode="bilinear",
        align_corners=False,
    ).squeeze(1)
    depth_loss = scale_invariant_l1(predicted, target, mask)

    semantic_logits = semantic_head(outputs.hidden_states)
    semantic_logits = functional.interpolate(
        semantic_logits,
        size=semantic_target.shape[-2:],
        mode="bilinear",
        align_corners=False,
    )
    semantic_loss = functional.cross_entropy(semantic_logits, semantic_target)
    return depth_loss + semantic_loss_weight * semantic_loss


def train_gamus(
    dataset_root: str | Path,
    split_manifest: str | Path,
    checkpoint_path: str | Path,
    *,
    config: TrainingConfig | None = None,
) -> TrainingResult:
    """Fine-tune Depth Anything V2 on a scene-level GAMUS split."""

    try:
        import torch
        from torch.utils.data import DataLoader
        from transformers import AutoImageProcessor, AutoModelForDepthEstimation
    except ImportError as exc:
        raise TrainingDependencyError(
            "Fine-tuning requires torch and transformers."
        ) from exc

    settings = config or TrainingConfig()
    if settings.epochs < 1 or settings.batch_size < 1:
        raise ValueError("epochs and batch_size must be positive.")
    if settings.max_grad_norm <= 0:
        raise ValueError("max_grad_norm must be positive.")
    torch.manual_seed(settings.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(settings.seed)
    device = torch.device(
        settings.device or ("cuda" if torch.cuda.is_available() else "cpu")
    )

    scene_split = load_scene_split(split_manifest)
    train_dataset = GamusPatchDataset(
        dataset_root,
        split="train",
        patch_size=settings.patch_size,
        patches_per_scene=settings.patches_per_scene,
        seed=settings.seed,
        scene_ids=scene_split.train,
        height_aware=settings.height_aware_patches,
        focus_classes=settings.focus_classes,
        min_focus_fraction=settings.min_focus_fraction,
    )
    validation_dataset = GamusPatchDataset(
        dataset_root,
        split="train",
        patch_size=settings.patch_size,
        patches_per_scene=settings.patches_per_scene,
        seed=settings.seed,
        scene_ids=scene_split.validation,
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
    semantic_head = None
    if settings.multitask:
        hidden_size = int(model.config.backbone_config.hidden_size)
        semantic_head = SemanticAuxiliaryHead(
            hidden_size,
            num_classes=settings.semantic_classes,
        ).to(device)
    if settings.freeze_backbone:
        for parameter in model.backbone.parameters():
            parameter.requires_grad = False
    elif hasattr(model, "gradient_checkpointing_enable"):
        model.gradient_checkpointing_enable()
    optimizer = torch.optim.AdamW(
        (
            parameter
            for parameter in (
                list(model.parameters())
                + (list(semantic_head.parameters()) if semantic_head is not None else [])
            )
            if parameter.requires_grad
        ),
        lr=settings.learning_rate,
    )

    best_validation_loss = float("inf")
    final_training_loss = float("inf")
    epochs_completed = 0
    skipped_training_batches = 0
    destination = Path(checkpoint_path)
    destination.parent.mkdir(parents=True, exist_ok=True)

    for _ in range(settings.epochs):
        model.train()
        if semantic_head is not None:
            semantic_head.train()
        training_losses = []
        for batch in train_loader:
            optimizer.zero_grad(set_to_none=True)
            if semantic_head is None:
                loss = _prediction_loss(
                    model, processor, batch, device, settings.patch_size
                )
            else:
                loss = _joint_prediction_loss(
                    model,
                    semantic_head,
                    processor,
                    batch,
                    device,
                    settings.patch_size,
                    settings.semantic_loss_weight,
                )
            if not torch.isfinite(loss):
                skipped_training_batches += 1
                optimizer.zero_grad(set_to_none=True)
                continue
            loss.backward()
            grad_norm = torch.nn.utils.clip_grad_norm_(
                (
                    list(model.parameters())
                    + (list(semantic_head.parameters()) if semantic_head is not None else [])
                ),
                max_norm=settings.max_grad_norm,
            )
            if not torch.isfinite(grad_norm):
                skipped_training_batches += 1
                optimizer.zero_grad(set_to_none=True)
                continue
            optimizer.step()
            training_losses.append(float(loss.detach().cpu()))

        model.eval()
        if semantic_head is not None:
            semantic_head.eval()
        validation_losses = []
        with torch.no_grad():
            for batch in validation_loader:
                if semantic_head is None:
                    loss = _prediction_loss(
                        model, processor, batch, device, settings.patch_size
                    )
                else:
                    loss = _joint_prediction_loss(
                        model,
                        semantic_head,
                        processor,
                        batch,
                        device,
                        settings.patch_size,
                        settings.semantic_loss_weight,
                    )
                validation_losses.append(float(loss.detach().cpu()))

        if not training_losses or not validation_losses:
            raise RuntimeError("Training produced no finite loss values.")
        final_training_loss = float(np.mean(training_losses))
        validation_loss = float(np.mean(validation_losses))
        epochs_completed += 1
        if validation_loss < best_validation_loss:
            best_validation_loss = validation_loss
            torch.save(
                {
                    "model_state_dict": model.state_dict(),
                    "semantic_head_state_dict": (
                        semantic_head.state_dict()
                        if semantic_head is not None
                        else None
                    ),
                    "optimizer_state_dict": optimizer.state_dict(),
                    "config": asdict(settings),
                    "validation_loss": validation_loss,
                    "scene_split": asdict(scene_split),
                },
                destination,
            )

    return TrainingResult(
        best_validation_loss=best_validation_loss,
        final_training_loss=final_training_loss,
        epochs_completed=epochs_completed,
        checkpoint_path=destination,
    )
