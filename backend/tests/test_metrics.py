import numpy as np
import pytest

from backend.evaluation.metrics import MetricError, compute_metrics


def test_compute_metrics_returns_expected_regression_values():
    predicted = np.array([1.0, 3.0, 5.0])
    reference = np.array([1.0, 2.0, 7.0])

    metrics = compute_metrics(predicted, reference)

    assert metrics.mae == pytest.approx(1.0)
    assert metrics.rmse == pytest.approx(np.sqrt(5 / 3))
    assert metrics.r2 == pytest.approx(0.7580645161)
    assert metrics.sample_count == 3


def test_compute_metrics_filters_nonfinite_and_applies_mask():
    predicted = np.array([[1.0, 3.0], [np.nan, 8.0]])
    reference = np.array([[1.0, 2.0], [4.0, 7.0]])
    mask = np.array([[True, False], [True, True]])

    metrics = compute_metrics(predicted, reference, mask=mask)

    assert metrics.mae == pytest.approx(0.5)
    assert metrics.rmse == pytest.approx(1 / np.sqrt(2))
    assert metrics.sample_count == 2


def test_compute_metrics_reports_undefined_r2_for_constant_reference():
    metrics = compute_metrics([2.0, 3.0], [2.0, 2.0])

    assert metrics.r2 is None


@pytest.mark.parametrize(
    ("predicted", "reference", "mask", "message"),
    [
        ([1.0], [1.0, 2.0], None, "equal shape"),
        ([1.0], [1.0], [True, False], "same shape"),
        ([np.nan], [1.0], None, "valid sample"),
        ([1.0], [1.0], [False], "valid sample"),
    ],
)
def test_compute_metrics_rejects_invalid_inputs(
    predicted,
    reference,
    mask,
    message,
):
    with pytest.raises(MetricError, match=message):
        compute_metrics(predicted, reference, mask=mask)
