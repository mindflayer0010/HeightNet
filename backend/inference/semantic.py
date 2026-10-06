"""GAMUS semantic-head inference on a frozen Depth Anything encoder."""

from __future__ import annotations

from pathlib import Path

import numpy as np

from backend.inference.depth_anything import _to_pil
from backend.inference.training import SemanticAuxiliaryHead, TrainingDependencyError


class SemanticInferenceError(ValueError):
    """Raised when semantic-head inference cannot be completed."""


class GamusSemanticEstimator:
    """Predict GAMUS land-cover probabilities using a frozen depth backbone."""

    def __init__(
        self,
        depth_checkpoint_path: str | Path,
        semantic_checkpoint_path: str | Path,
        *,
        model_id: str = "depth-anything/Depth-Anything-V2-Small-hf",
        semantic_classes: int = 7,
        device: str | None = None,
        depth_estimator=None,
    ) -> None:
        try:
            import torch
            import torch.nn.functional as functional
            from transformers import AutoImageProcessor, AutoModelForDepthEstimation
        except ImportError as exc:
            raise TrainingDependencyError(
                "Semantic inference requires torch and transformers."
            ) from exc

        self._torch = torch
        self._functional = functional
        if depth_estimator is None:
            self.model_id = model_id
            self.device = torch.device(
                device or ("cuda" if torch.cuda.is_available() else "cpu")
            )
            self.processor = AutoImageProcessor.from_pretrained(model_id)
            self.model = AutoModelForDepthEstimation.from_pretrained(model_id).to(self.device)
            depth_checkpoint = torch.load(depth_checkpoint_path, map_location=self.device)
            self.model.load_state_dict(depth_checkpoint["model_state_dict"])
            self.model.eval()
        else:
            self.model_id = depth_estimator.model_id
            self.device = depth_estimator.device
            self.processor = depth_estimator.processor
            self.model = depth_estimator.model
        hidden_size = int(self.model.config.backbone_config.hidden_size)
        self.semantic_head = SemanticAuxiliaryHead(
            hidden_size,
            num_classes=semantic_classes,
        ).to(self.device)
        semantic_checkpoint = torch.load(
            semantic_checkpoint_path,
            map_location=self.device,
        )
        self.semantic_head.load_state_dict(semantic_checkpoint["semantic_head_state_dict"])
        self.semantic_head.eval()

    def predict_probabilities(self, image: np.ndarray) -> np.ndarray:
        """Return ``(height, width, classes)`` probabilities."""

        _, probabilities = self.predict_depth_and_probabilities(image)
        return probabilities

    def predict_depth_and_probabilities(
        self,
        image: np.ndarray,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Return relative depth and semantic probabilities from one forward pass."""

        return self.predict_depth_and_probabilities_batch([image])[0]

    def predict_depth_and_probabilities_batch(
        self,
        images: list[np.ndarray],
        *,
        inference_size: int | None = None,
    ) -> tuple[tuple[np.ndarray, np.ndarray], ...]:
        """Return depth and semantic probabilities for a batch."""

        if not images:
            raise SemanticInferenceError("At least one image is required.")
        pil_images = [_to_pil(image) for image in images]
        if len({(image.height, image.width) for image in pil_images}) != 1:
            raise SemanticInferenceError("Batched semantic inference requires equal image sizes.")
        processor_options = {}
        if inference_size is not None:
            if inference_size < 14:
                raise SemanticInferenceError("inference_size must be at least 14 pixels.")
            processor_options = {
                "do_resize": True,
                "size": {"height": inference_size, "width": inference_size},
            }
        inputs = self.processor(images=pil_images, return_tensors="pt", **processor_options)
        inputs = {key: value.to(self.device) for key, value in inputs.items()}
        with self._torch.inference_mode():
            outputs = self.model(**inputs, output_hidden_states=True)
            logits = self.semantic_head(
                outputs.hidden_states,
                spatial_shape=inputs["pixel_values"].shape[-2:],
            )
            logits = self._functional.interpolate(
                logits,
                size=(pil_images[0].height, pil_images[0].width),
                mode="bilinear",
                align_corners=False,
            )
            probabilities = self._torch.softmax(logits, dim=1)
            processed = self.processor.post_process_depth_estimation(
                outputs,
                target_sizes=[(image.height, image.width) for image in pil_images],
            )
        return tuple(
            (
                item["predicted_depth"].detach().cpu().numpy().astype(
                    np.float32, copy=True
                ),
                probabilities[index].permute(1, 2, 0).cpu().numpy().astype(
                    np.float32, copy=True
                ),
            )
            for index, item in enumerate(processed)
        )
