"""Create display previews without changing geospatial source rasters."""

from __future__ import annotations

from pathlib import Path

import numpy as np


class PreviewDependencyError(ImportError):
    """Raised when PNG preview support is not installed."""


def write_gamus_preview(
    source_path: str | Path,
    output_path: str | Path,
    *,
    dataset_key: str = "image",
) -> Path:
    """Write a viewable PNG from a GAMUS HDF5 dataset.

    GAMUS RGB arrays are written directly; 2-D AGL/class arrays receive a
    percentile stretch for display. The source HDF5 file is never modified.
    """

    try:
        import h5py
        from PIL import Image
    except ImportError as exc:
        raise PreviewDependencyError(
            "GAMUS previews require h5py and Pillow."
        ) from exc

    with h5py.File(source_path, "r") as source:
        if dataset_key not in source:
            raise ValueError(f"GAMUS file has no '{dataset_key}' dataset.")
        values = np.asarray(source[dataset_key][()])

    if values.ndim == 3 and values.shape[-1] == 3:
        if values.dtype != np.uint8:
            values = np.clip(values, 0, 255).astype(np.uint8)
        image = Image.fromarray(values, mode="RGB")
    elif values.ndim == 2:
        valid = values[np.isfinite(values)]
        if valid.size == 0:
            raise ValueError("GAMUS dataset contains no finite values.")
        low, high = np.percentile(valid, (2, 98))
        if high <= low:
            display = np.zeros(values.shape, dtype=np.uint8)
        else:
            display = np.clip((values - low) / (high - low) * 255, 0, 255)
            display = np.nan_to_num(display, nan=0).astype(np.uint8)
        image = Image.fromarray(display, mode="L")
    else:
        raise ValueError(
            "GAMUS preview expects an RGB array (height, width, 3) or "
            "a 2-D array (height, width)."
        )

    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination)
    return destination


def write_rgb_preview(
    source_path: str | Path,
    output_path: str | Path,
    *,
    lower_percentile: float = 2.0,
    upper_percentile: float = 98.0,
) -> Path:
    """Write a contrast-stretched PNG preview of the first three raster bands."""

    try:
        import rasterio
        from PIL import Image
    except ImportError as exc:
        raise PreviewDependencyError(
            "PNG previews require Rasterio and Pillow."
        ) from exc

    if not 0 <= lower_percentile < upper_percentile <= 100:
        raise ValueError("Preview percentiles must be ordered between 0 and 100.")

    with rasterio.open(source_path) as source:
        if source.count < 3:
            raise ValueError("An RGB preview requires at least three raster bands.")
        bands = source.read((1, 2, 3), masked=True)

    preview = np.zeros(bands.shape, dtype=np.uint8)
    for index, band in enumerate(bands):
        valid = band.compressed()
        if valid.size == 0:
            continue
        low, high = np.percentile(valid, (lower_percentile, upper_percentile))
        if high <= low:
            preview[index] = np.clip(valid[0], 0, 255)
            continue
        scaled = (band.astype(np.float32) - low) / (high - low)
        preview[index] = np.clip(scaled.filled(0) * 255, 0, 255).astype(np.uint8)

    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.moveaxis(preview, 0, -1), mode="RGB").save(destination)
    return destination
