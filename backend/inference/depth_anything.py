"""Depth Anything V2 inference with an explicit relative-depth contract."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np


class InferenceDependencyError(ImportError):
    """Raised when model inference dependencies are unavailable."""


class InferenceInputError(ValueError):
    """Raised when an input image cannot be converted to RGB."""


@dataclass(frozen=True)
class DepthPrediction:
    """One model output before metric calibration."""

    relative_depth: np.ndarray
    model_id: str
    device: str
    depth_reference: str = "relative"


def _to_pil(image: np.ndarray):
    try:
        from PIL import Image
    except ImportError as exc:
        raise InferenceDependencyError(
            "Depth inference requires Pillow."
        ) from exc

    array = np.asarray(image)
    if array.ndim == 3 and array.shape[0] == 3 and array.shape[-1] != 3:
        array = np.moveaxis(array, 0, -1)
    if array.ndim != 3 or array.shape[-1] != 3:
        raise InferenceInputError("The input image must have shape (H, W, 3) or (3, H, W).")

    if np.issubdtype(array.dtype, np.floating):
        if float(np.nanmax(array)) <= 1.0:
            array = array * 255.0
        array = np.nan_to_num(array, nan=0.0, posinf=255.0, neginf=0.0)
    else:
        # GAMUS imagery can be integer/bool encoded. Avoid a needless
        # floating-point temporary for those arrays, which matters on CPU-only
        # machines when a large split is being evaluated.
        array = np.asarray(array, dtype=np.uint8)
    return Image.fromarray(np.clip(array, 0, 255).astype(np.uint8), mode="RGB")


class DepthAnythingV2Estimator:
    """Run the official Hugging Face Depth Anything V2 checkpoint."""

    def __init__(
        self,
        model_id: str = "depth-anything/Depth-Anything-V2-Small-hf",
        *,
        device: str | None = None,
        checkpoint_path: str | Path | None = None,
    ) -> None:
        try:
            import torch
            from transformers import AutoImageProcessor, AutoModelForDepthEstimation
        except ImportError as exc:
            raise InferenceDependencyError(
                "Depth inference requires torch and transformers."
            ) from exc

        self._torch = torch
        self.model_id = model_id
        selected_device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.device = torch.device(selected_device)
        self.processor = AutoImageProcessor.from_pretrained(model_id)
        self.model = AutoModelForDepthEstimation.from_pretrained(model_id)
        self.model.to(self.device)
        if checkpoint_path is not None:
            checkpoint = torch.load(checkpoint_path, map_location=self.device)
            self.model.load_state_dict(checkpoint["model_state_dict"])
        self.model.eval()

    def predict(self, image: np.ndarray, *, inference_size: int | None = None) -> DepthPrediction:
        """Predict a full-resolution relative depth map for one RGB image."""

        return self.predict_batch([image], inference_size=inference_size)[0]

    def predict_batch(
        self,
        images: list[np.ndarray],
        *,
        inference_size: int | None = None,
    ) -> tuple[DepthPrediction, ...]:
        """Predict a batch of RGB images in one transformer forward pass."""

        if not images:
            raise InferenceInputError("At least one image is required.")
        pil_images = [_to_pil(image) for image in images]
        processor_options = {}
        if inference_size is not None:
            if inference_size < 14:
                raise InferenceInputError("inference_size must be at least 14 pixels.")
            processor_options = {
                "do_resize": True,
                "size": {"height": inference_size, "width": inference_size},
            }
        inputs = self.processor(images=pil_images, return_tensors="pt", **processor_options)
        inputs = {key: value.to(self.device) for key, value in inputs.items()}

        with self._torch.inference_mode():
            outputs = self.model(**inputs)
        processed = self.processor.post_process_depth_estimation(
            outputs,
            target_sizes=[(image.height, image.width) for image in pil_images],
        )
        return tuple(
            DepthPrediction(
                relative_depth=item["predicted_depth"].detach().cpu().numpy().astype(
                    np.float32, copy=True
                ),
                model_id=self.model_id,
                device=str(self.device),
            )
            for item in processed
        )
