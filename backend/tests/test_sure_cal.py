import numpy as np
import pytest

from backend.evaluation.sure_cal import (
    SureCalibrationError,
    aggregate_tta,
    fit_sure_calibration,
    semantic_entropy,
)


def test_class_conditioned_calibration_shrinks_and_applies_labels() -> None:
    relative = np.arange(20, dtype=float)
    semantic = np.repeat([1, 3], 10)
    reference = np.where(semantic == 3, relative * 3 + 10, relative * 2 + 1)

    calibration = fit_sure_calibration(
        relative,
        reference,
        semantic,
        shrinkage=0,
        min_class_samples=2,
    )

    output = calibration.apply_class_conditioned(relative, semantic)
    np.testing.assert_allclose(output, reference)
    assert set(calibration.class_calibrations) == {1, 3}
    restored = calibration.from_dict(calibration.to_dict())
    np.testing.assert_allclose(
        restored.apply_class_conditioned(relative, semantic),
        output,
    )


def test_probability_application_and_uncertainty_fall_back_to_global() -> None:
    relative = np.arange(12, dtype=float)
    semantic = np.repeat([1, 3], 6)
    reference = np.where(semantic == 3, relative * 3 + 10, relative * 2 + 1)
    calibration = fit_sure_calibration(
        relative,
        reference,
        semantic,
        shrinkage=0,
        min_class_samples=2,
    )
    probabilities = np.zeros((12, 4), dtype=float)
    probabilities[np.arange(12), semantic] = 1.0
    high_uncertainty = np.full(12, 1_000.0)

    result = calibration.apply(
        relative,
        probabilities,
        uncertainty=high_uncertainty,
        uncertainty_temperature=1.0,
    )
    np.testing.assert_allclose(result, calibration.global_calibration.apply(relative))
    uncertainty = calibration.calibration_uncertainty(semantic)
    assert uncertainty.shape == relative.shape
    assert np.all(uncertainty > 0)


def test_tta_and_entropy() -> None:
    mean, standard_deviation = aggregate_tta(
        np.asarray([[1.0, 2.0], [3.0, 4.0]])
    )
    np.testing.assert_allclose(mean, [2.0, 3.0])
    np.testing.assert_allclose(standard_deviation, [1.0, 1.0])
    np.testing.assert_allclose(semantic_entropy(np.asarray([[1.0, 0.0], [0.5, 0.5]])), [0.0, 1.0])


def test_invalid_sure_inputs_raise() -> None:
    with pytest.raises(SureCalibrationError):
        aggregate_tta(np.ones((1, 4)))
    with pytest.raises(SureCalibrationError):
        semantic_entropy(np.zeros((2, 2)))
