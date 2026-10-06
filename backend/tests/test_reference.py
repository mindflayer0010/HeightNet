import numpy as np
import pytest

from backend.evaluation.reference import (
    ReferenceEvaluationError,
    compute_metrics,
    evaluate_gcp_calibration,
)


def test_compute_metrics_reports_height_error_and_bias():
    metrics = compute_metrics(np.array([11.0, 19.0]), np.array([10.0, 20.0]))

    assert metrics.sample_count == 2
    assert metrics.mae_m == pytest.approx(1.0)
    assert metrics.rmse_m == pytest.approx(1.0)
    assert metrics.bias_m == pytest.approx(0.0)


def test_compute_metrics_ignores_nonfinite_pairs():
    metrics = compute_metrics(np.array([11.0, np.nan, 19.0]), np.array([10.0, 20.0, np.inf]))

    assert metrics.sample_count == 1
    assert metrics.mae_m == pytest.approx(1.0)


def test_gcp_calibration_keeps_a_holdout():
    predicted = np.arange(10, dtype=float)
    reference = 2.0 * predicted + 5.0

    result = evaluate_gcp_calibration(predicted, reference, calibration_fraction=0.6)

    assert result["calibration_count"] == 6
    assert result["holdout_count"] == 4
    assert result["holdout_metrics"]["rmse_m"] == pytest.approx(0.0, abs=1e-8)


def test_gcp_calibration_requires_a_holdout():
    with pytest.raises(ReferenceEvaluationError, match="four paired GCPs"):
        evaluate_gcp_calibration([1.0, 2.0, 3.0], [4.0, 5.0, 6.0])
