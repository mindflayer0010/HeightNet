"""Streaming class-wise regression metrics for GAMUS height evaluation."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


# Mapping published by the GAMUS authors:
# https://github.com/EarthNets/RSI-MMSegmentation
GAMUS_CLASS_LABELS = {
    0: "others/background",
    1: "ground",
    2: "low vegetation",
    3: "buildings",
    4: "water",
    5: "road",
    6: "tree",
}


@dataclass(frozen=True)
class ClassMetrics:
    """Regression metrics accumulated for one semantic class."""

    class_id: int
    class_name: str
    pixel_count: int
    mae_m: float
    rmse_m: float
    r2: float | None
    correlation: float | None


class ClassMetricsAccumulator:
    """Accumulate class metrics without retaining every raster pixel."""

    def __init__(self, class_id: int, class_name: str) -> None:
        self.class_id = class_id
        self.class_name = class_name
        self.pixel_count = 0
        self.absolute_error_sum = 0.0
        self.squared_error_sum = 0.0
        self.predicted_sum = 0.0
        self.reference_sum = 0.0
        self.predicted_squared_sum = 0.0
        self.reference_squared_sum = 0.0
        self.cross_product_sum = 0.0

    def update(
        self,
        predicted: np.ndarray,
        reference: np.ndarray,
        mask: np.ndarray,
    ) -> None:
        """Add one aligned raster subset to the accumulator."""

        selected_predicted = np.asarray(predicted, dtype=float)[mask]
        selected_reference = np.asarray(reference, dtype=float)[mask]
        if selected_predicted.size == 0:
            return

        residuals = selected_predicted - selected_reference
        self.pixel_count += int(selected_predicted.size)
        self.absolute_error_sum += float(np.abs(residuals).sum())
        self.squared_error_sum += float(np.square(residuals).sum())
        self.predicted_sum += float(selected_predicted.sum())
        self.reference_sum += float(selected_reference.sum())
        self.predicted_squared_sum += float(np.square(selected_predicted).sum())
        self.reference_squared_sum += float(np.square(selected_reference).sum())
        self.cross_product_sum += float(
            (selected_predicted * selected_reference).sum()
        )

    def finalize(self) -> ClassMetrics:
        """Return metrics for all pixels added so far."""

        if self.pixel_count == 0:
            raise ValueError("At least one valid pixel is required.")

        count = float(self.pixel_count)
        reference_total_sum_squares = (
            self.reference_squared_sum - self.reference_sum**2 / count
        )
        residual_sum_squares = self.squared_error_sum
        r2 = None
        if reference_total_sum_squares > np.finfo(float).eps:
            r2 = 1.0 - residual_sum_squares / reference_total_sum_squares

        predicted_variance = (
            self.predicted_squared_sum - self.predicted_sum**2 / count
        )
        reference_variance = reference_total_sum_squares
        covariance = (
            self.cross_product_sum
            - self.predicted_sum * self.reference_sum / count
        )
        correlation = None
        denominator = np.sqrt(max(predicted_variance, 0.0) * max(reference_variance, 0.0))
        if denominator > np.finfo(float).eps:
            correlation = covariance / denominator

        return ClassMetrics(
            class_id=self.class_id,
            class_name=self.class_name,
            pixel_count=self.pixel_count,
            mae_m=self.absolute_error_sum / count,
            rmse_m=float(np.sqrt(self.squared_error_sum / count)),
            r2=r2,
            correlation=correlation,
        )
