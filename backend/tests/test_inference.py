import numpy as np
import pytest

from backend.inference.depth_anything import InferenceInputError, _to_pil


def test_to_pil_accepts_channel_first_rgb() -> None:
    image = np.zeros((3, 8, 9), dtype=np.uint8)

    converted = _to_pil(image)

    assert converted.size == (9, 8)
    assert converted.mode == "RGB"


def test_to_pil_rejects_non_rgb_input() -> None:
    with pytest.raises(InferenceInputError):
        _to_pil(np.zeros((8, 9), dtype=np.uint8))
