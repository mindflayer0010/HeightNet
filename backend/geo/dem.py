"""Fetch and align a lower-resolution NASADEM/SRTM-derived ground raster."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np


class DemDependencyError(ImportError):
    """Raised when DEM acquisition dependencies are unavailable."""


class DemRequestError(ValueError):
    """Raised when a DEM cannot be found or aligned."""


@dataclass(frozen=True)
class GroundDem:
    """Ground elevation aligned to a reference raster grid."""

    elevation: np.ndarray
    source_item_ids: tuple[str, ...]
    source_collection: str


def fetch_nasadem_for_raster(
    reference_path: str | Path,
    *,
    collection_id: str = "nasadem",
) -> GroundDem:
    """Fetch NASADEM tiles intersecting a GeoTIFF and reproject to its grid."""

    try:
        import planetary_computer
        import pystac_client
        import rasterio
        from pyproj import Transformer
        from rasterio.warp import reproject, Resampling
    except ImportError as exc:
        raise DemDependencyError(
            "DEM acquisition requires Planetary Computer, PySTAC, PyProj, and Rasterio."
        ) from exc

    with rasterio.open(reference_path) as reference:
        if reference.crs is None:
            raise DemRequestError("The reference GeoTIFF has no CRS.")
        to_wgs84 = Transformer.from_crs(reference.crs, "EPSG:4326", always_xy=True)
        bbox = to_wgs84.transform_bounds(*reference.bounds, densify_pts=21)
        destination_shape = (reference.height, reference.width)
        destination_transform = reference.transform
        destination_crs = reference.crs

    catalog = pystac_client.Client.open(
        "https://planetarycomputer.microsoft.com/api/stac/v1"
    )
    items = list(catalog.search(collections=[collection_id], bbox=bbox).items())
    if not items:
        raise DemRequestError(f"No DEM items intersect the reference bounds: {bbox}.")

    ground = np.full(destination_shape, np.nan, dtype=np.float32)
    item_ids = []
    for item in items:
        signed_item = planetary_computer.sign(item)
        if "elevation" not in signed_item.assets:
            raise DemRequestError(f"DEM item '{item.id}' has no elevation asset.")
        item_ids.append(item.id)
        with rasterio.open(signed_item.assets["elevation"].href) as source:
            reproject(
                source=rasterio.band(source, 1),
                destination=ground,
                src_transform=source.transform,
                src_crs=source.crs,
                src_nodata=source.nodata,
                dst_transform=destination_transform,
                dst_crs=destination_crs,
                dst_nodata=np.nan,
                # Preserve pixels already written by an adjacent DEM tile.
                # The destination is initialized to NaN before the loop.
                init_dest_nodata=False,
                resampling=Resampling.bilinear,
            )

    if not np.isfinite(ground).any():
        raise DemRequestError("DEM reprojection produced no finite ground values.")
    return GroundDem(
        elevation=ground,
        source_item_ids=tuple(item_ids),
        source_collection=collection_id,
    )
