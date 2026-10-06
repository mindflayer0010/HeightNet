import numpy as np

from backend.evaluation.scene_quality import assess_scene


def test_scene_quality_returns_bounded_risk_map_and_summary() -> None:
    image = np.zeros((12, 16, 3), dtype=np.uint8)
    assessment = assess_scene(image)

    assert assessment.risk_map.shape == (12, 16)
    assert np.all((assessment.risk_map >= 0) & (assessment.risk_map <= 1))
    assert assessment.risk_score >= 0
    assert "possible_shadow_or_occlusion" in assessment.flags
    assert assessment.to_dict()["recommended_action"]


def test_semantic_ambiguity_adds_risk_without_breaking_shape() -> None:
    image = np.random.default_rng(4).integers(0, 255, size=(8, 9, 3), dtype=np.uint8)
    probabilities = np.full((8, 9, 7), 1 / 7, dtype=np.float32)

    assessment = assess_scene(image, probabilities)

    assert assessment.risk_map.shape == (8, 9)
    assert "semantic_prediction_ambiguous" in assessment.flags
