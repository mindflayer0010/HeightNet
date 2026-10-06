import numpy as np
import pytest

from backend.geo.calibration import CalibrationError, apply_affine, compose_dsm, fit_affine


def test_fit_affine_recovers_scale_and_offset():
    relative = np.arange(1, 7, dtype=float)
    reference = 2.5 * relative - 4.0

    result = fit_affine(relative, reference)

    assert result.scale == pytest.approx(2.5)
    assert result.offset == pytest.approx(-4.0)
    assert result.residual_mae == pytest.approx(0.0)
    assert result.inlier_count == result.sample_count == 6


def test_robust_fit_limits_outlier_influence():
    relative = np.arange(1, 11, dtype=float)
    reference = 3.0 * relative + 2.0
    reference[-1] = 1000.0

    result = fit_affine(relative, reference)

    assert result.scale == pytest.approx(3.0, abs=0.05)
    assert result.offset == pytest.approx(2.0, abs=0.5)
    assert result.inlier_count < result.sample_count


def test_nonfinite_observations_are_ignored():
    relative = np.array([0.0, 1.0, np.nan, 2.0])
    reference = np.array([5.0, 7.0, 99.0, np.inf])

    result = fit_affine(relative, reference)

    assert result.scale == pytest.approx(2.0)
    assert result.offset == pytest.approx(5.0)
    assert result.sample_count == 2


def test_apply_affine_preserves_shape():
    values = np.array([[1.0, 2.0], [3.0, 4.0]])

    calibrated = apply_affine(values, 2.0, 10.0)

    np.testing.assert_array_equal(calibrated, [[12.0, 14.0], [16.0, 18.0]])


def test_compose_dsm_adds_ground_and_above_ground_height():
    ground = np.array([[100.0, 101.0]])
    above_ground = np.array([[12.0, 8.0]])

    dsm = compose_dsm(ground, above_ground)

    np.testing.assert_array_equal(dsm, [[112.0, 109.0]])


def test_compose_dsm_rejects_misaligned_arrays():
    with pytest.raises(CalibrationError, match="equal shape"):
        compose_dsm(np.zeros((2, 2)), np.zeros((2, 3)))


@pytest.mark.parametrize(
    ("relative", "reference", "message"),
    [
        ([1.0], [2.0], "At least two valid observations"),
        ([1.0, 1.0], [2.0, 3.0], "two distinct values"),
        ([1.0, 2.0], [3.0], "equal size"),
    ],
)
def test_invalid_inputs_raise_calibration_error(relative, reference, message):
    with pytest.raises(CalibrationError, match=message):
        fit_affine(relative, reference)
