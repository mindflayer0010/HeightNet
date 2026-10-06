import numpy as np
import pytest

from backend.inference.training import SemanticAuxiliaryHead, scale_invariant_l1


def test_scale_invariant_l1_ignores_affine_transform():
    torch = pytest.importorskip("torch")
    target = torch.tensor([[[0.0, 1.0], [2.0, 3.0]]])
    predicted = target * 7.0 + 12.0
    mask = torch.ones_like(target, dtype=torch.bool)

    loss = scale_invariant_l1(predicted, target, mask)

    assert float(loss) == pytest.approx(0.0, abs=1e-6)


def test_semantic_auxiliary_head_returns_patch_logits():
    torch = pytest.importorskip("torch")
    head = SemanticAuxiliaryHead(hidden_size=4, num_classes=7)
    hidden_states = (torch.zeros(1, 10, 4), torch.randn(1, 10, 4))

    logits = head(hidden_states)

    assert tuple(logits.shape) == (1, 7, 3, 3)
