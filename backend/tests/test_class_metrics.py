import numpy as np
import pytest

from backend.evaluation.class_metrics import ClassMetricsAccumulator


def test_class_metrics_accumulator_matches_known_values():
    accumulator = ClassMetricsAccumulator(3, "buildings")
    predicted = np.array([[2.0, 4.0], [8.0, 10.0]])
    reference = np.array([[1.0, 5.0], [7.0, 11.0]])

    accumulator.update(predicted, reference, np.ones((2, 2), dtype=bool))
    metrics = accumulator.finalize()

    assert metrics.class_id == 3
    assert metrics.class_name == "buildings"
    assert metrics.pixel_count == 4
    assert metrics.mae_m == pytest.approx(1.0)
    assert metrics.rmse_m == pytest.approx(1.0)
    assert metrics.r2 == pytest.approx(0.9230769)
    assert metrics.correlation == pytest.approx(0.9647638)


def test_class_metrics_accumulator_ignores_empty_updates():
    accumulator = ClassMetricsAccumulator(5, "road")
    accumulator.update(
        np.ones((2, 2)),
        np.ones((2, 2)),
        np.zeros((2, 2), dtype=bool),
    )

    with pytest.raises(ValueError, match="valid pixel"):
        accumulator.finalize()
