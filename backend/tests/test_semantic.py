import numpy as np
import pytest

from backend.evaluation.sure_cal import semantic_entropy


def test_semantic_head_supports_rectangular_token_grids() -> None:
    torch = pytest.importorskip("torch")
    from backend.inference.training import SemanticAuxiliaryHead

    head = SemanticAuxiliaryHead(hidden_size=4, num_classes=7)
    hidden_states = (torch.zeros((1, 1 + 6 * 8, 4)),)
    logits = head(hidden_states, spatial_shape=(600, 800))
    assert tuple(logits.shape) == (1, 7, 6, 8)


def test_semantic_entropy_accepts_probability_raster() -> None:
    probabilities = np.zeros((2, 3, 4), dtype=float)
    probabilities[..., 0] = 1.0
    probabilities[1, 2] = 0.25
    probabilities[1, 2, 1:] = 0.25
    np.testing.assert_allclose(semantic_entropy(probabilities)[0, 0], 0.0)
    assert semantic_entropy(probabilities)[1, 2] > 0.99
