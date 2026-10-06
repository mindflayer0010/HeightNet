from __future__ import annotations

import pytest

from backend.acquisition.stac import AcquisitionError, _build_date_filter, validate_bbox


def test_validate_bbox_accepts_wgs84_order() -> None:
    assert validate_bbox((77.1, 30.1, 77.2, 30.2)) == (77.1, 30.1, 77.2, 30.2)


@pytest.mark.parametrize(
    "bbox",
    [
        (77.2, 30.1, 77.1, 30.2),
        (77.1, 30.2, 77.2, 30.1),
        (181, 30.1, 182, 30.2),
        (77.1, 91, 77.2, 92),
    ],
)
def test_validate_bbox_rejects_bad_order_or_range(bbox: tuple[float, ...]) -> None:
    with pytest.raises(AcquisitionError):
        validate_bbox(bbox)


@pytest.mark.parametrize(
    ("date_from", "date_to", "expected"),
    [
        (None, None, None),
        ("2026-09-01", None, "2026-09-01T00:00:00Z/.."),
        (None, "2026-09-07", "../2026-09-07T23:59:59Z"),
        ("2026-09-01", "2026-09-07", "2026-09-01T00:00:00Z/2026-09-07T23:59:59Z"),
    ],
)
def test_scene_date_filter_builds_inclusive_stac_interval(date_from, date_to, expected) -> None:
    assert _build_date_filter(date_from, date_to) == expected


def test_scene_date_filter_rejects_reversed_or_malformed_dates() -> None:
    with pytest.raises(AcquisitionError):
        _build_date_filter("2026-09-08", "2026-09-07")
    with pytest.raises(AcquisitionError):
        _build_date_filter("09/01/2026", None)
