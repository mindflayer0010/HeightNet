"""Geospatial raster input and output helpers."""

from __future__ import annotations

from pathlib import Path

import numpy as np


class GeoRasterDependencyError(ImportError):
    """Raised when Rasterio is unavailable."""


def read_rgb_geotiff(path: str | Path) -> np.ndarray:
    """Read the first three bands and stretch them to model-ready uint8 RGB."""

    try:
        import rasterio
    except ImportError as exc:
        raise GeoRasterDependencyError("GeoTIFF processing requires Rasterio.") from exc

    with rasterio.open(path) as source:
        if source.count < 3:
            raise ValueError("The input GeoTIFF must contain at least three bands.")
        bands = source.read((1, 2, 3), masked=True)

    rgb = np.zeros(bands.shape, dtype=np.uint8)
    for index, band in enumerate(bands):
        valid = band.compressed()
        if valid.size == 0:
            continue
        low, high = np.percentile(valid, (2, 98))
        if high <= low:
            continue
        scaled = (band.astype(np.float32) - low) / (high - low)
        rgb[index] = np.clip(scaled.filled(0) * 255, 0, 255).astype(np.uint8)
    return np.moveaxis(rgb, 0, -1)


def write_single_band_geotiff(
    reference_path: str | Path,
    output_path: str | Path,
    values: np.ndarray,
    *,
    description: str,
    nodata: float = -9999.0,
) -> Path:
    """Write one float32 band on the exact grid of a reference GeoTIFF."""

    try:
        import rasterio
    except ImportError as exc:
        raise GeoRasterDependencyError("GeoTIFF processing requires Rasterio.") from exc

    with rasterio.open(reference_path) as reference:
        expected_shape = (reference.height, reference.width)
        if values.shape != expected_shape:
            raise ValueError(
                f"Values have shape {values.shape}; expected {expected_shape}."
            )
        profile = reference.profile.copy()
        profile.update(
            count=1,
            dtype="float32",
            nodata=nodata,
            compress="deflate",
        )

    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    array = np.nan_to_num(values, nan=nodata, posinf=nodata, neginf=nodata).astype(
        np.float32,
        copy=False,
    )
    with rasterio.open(destination, "w", **profile) as target:
        target.write(array, 1)
        target.set_band_description(1, description)
    return destination


def write_float_geotiff(
    output_path: str | Path,
    values: np.ndarray,
    *,
    description: str,
    crs: object | None = None,
    transform: object | None = None,
    nodata: float = -9999.0,
) -> Path:
    """Write a standalone single-band float GeoTIFF.

    When ``crs`` and ``transform`` are omitted, the output deliberately has
    no spatial reference and represents pixel-relative data only.
    """

    try:
        import rasterio
    except ImportError as exc:
        raise GeoRasterDependencyError("GeoTIFF processing requires Rasterio.") from exc

    array = np.asarray(values)
    if array.ndim != 2:
        raise ValueError(f"Values must be a 2D raster; received shape {array.shape}.")
    profile = {
        "driver": "GTiff",
        "height": array.shape[0],
        "width": array.shape[1],
        "count": 1,
        "dtype": "float32",
        "nodata": nodata,
        "compress": "deflate",
    }
    if crs is not None:
        profile["crs"] = crs
    if transform is not None:
        profile["transform"] = transform

    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    cleaned = np.nan_to_num(array, nan=nodata, posinf=nodata, neginf=nodata).astype(
        np.float32,
        copy=False,
    )
    with rasterio.open(destination, "w", **profile) as target:
        target.write(cleaned, 1)
        target.set_band_description(1, description)
    return destination
