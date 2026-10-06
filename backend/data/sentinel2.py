"""Download small, georeferenced Sentinel-2 RGB scenes from STAC."""

from __future__ import annotations

from pathlib import Path
from typing import Sequence


class Sentinel2DependencyError(ImportError):
    """Raised when the optional Sentinel-2 dependencies are unavailable."""


class Sentinel2RequestError(ValueError):
    """Raised when a Sentinel-2 request is invalid."""


def _validate_bbox(bbox_wgs84: Sequence[float]) -> tuple[float, float, float, float]:
    if len(bbox_wgs84) != 4:
        raise Sentinel2RequestError(
            "bbox_wgs84 must contain (min_longitude, min_latitude, "
            "max_longitude, max_latitude)."
        )
    min_lon, min_lat, max_lon, max_lat = map(float, bbox_wgs84)
    if not (-180 <= min_lon < max_lon <= 180 and -90 <= min_lat < max_lat <= 90):
        raise Sentinel2RequestError("bbox_wgs84 must be an ordered WGS84 bounding box.")
    return min_lon, min_lat, max_lon, max_lat


def download_sentinel2_rgb(
    item_url: str,
    output_path: str | Path,
    *,
    bbox_wgs84: Sequence[float] | None = None,
    asset_keys: Sequence[str] = ("B04", "B03", "B02"),
) -> Path:
    """Write a georeferenced RGB GeoTIFF from a signed STAC item.

    ``asset_keys`` are written in their supplied order, so the default produces
    red, green, blue bands.  When ``bbox_wgs84`` is supplied, Rasterio reads
    only that window from the remote COG instead of downloading the full tile.
    """

    if tuple(asset_keys) != ("B04", "B03", "B02"):
        raise Sentinel2RequestError("asset_keys must be the RGB bands B04, B03, B02.")
    bbox = _validate_bbox(bbox_wgs84) if bbox_wgs84 is not None else None

    try:
        import planetary_computer
        import pystac
        import rioxarray
        from pyproj import Transformer
        import xarray as xr
    except ImportError as exc:
        raise Sentinel2DependencyError(
            "Sentinel-2 acquisition requires the optional 'remote' dependencies."
        ) from exc

    item = pystac.Item.from_file(item_url)
    missing = [key for key in asset_keys if key not in item.assets]
    if missing:
        raise Sentinel2RequestError(
            f"STAC item does not contain required assets: {', '.join(missing)}."
        )
    signed_item = planetary_computer.sign(item)

    arrays = []
    try:
        for key in asset_keys:
            array = rioxarray.open_rasterio(signed_item.assets[key].href)
            if bbox is not None:
                if array.rio.crs is None:
                    raise Sentinel2RequestError(f"Asset '{key}' has no CRS.")
                transformer = Transformer.from_crs(
                    "EPSG:4326", array.rio.crs, always_xy=True
                )
                native_bbox = transformer.transform_bounds(*bbox, densify_pts=21)
                array = array.rio.clip_box(
                    minx=native_bbox[0],
                    miny=native_bbox[1],
                    maxx=native_bbox[2],
                    maxy=native_bbox[3],
                )
            arrays.append(array)

        rgb = xr.concat(arrays, dim="band")
        destination = Path(output_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        rgb.rio.to_raster(destination, driver="GTiff")
    finally:
        for array in arrays:
            close = getattr(array, "close", None)
            if close is not None:
                close()

    return Path(output_path)


def download_sentinel2_visual(
    item_url: str | Path,
    output_path: str | Path,
    *,
    bbox_wgs84: Sequence[float] | None = None,
) -> Path:
    """Write Sentinel-2's rendered visual asset for display textures.

    The raw B04/B03/B02 bands are kept for model inference. The STAC ``visual``
    asset is already rendered for natural-colour viewing and is therefore a
    better texture for the 3D terrain viewer.
    """

    bbox = _validate_bbox(bbox_wgs84) if bbox_wgs84 is not None else None

    try:
        import planetary_computer
        import pystac
        import rioxarray
        from pyproj import Transformer
    except ImportError as exc:
        raise Sentinel2DependencyError(
            "Sentinel-2 acquisition requires the optional 'remote' dependencies."
        ) from exc

    item = pystac.Item.from_file(item_url)
    if "visual" not in item.assets:
        raise Sentinel2RequestError("STAC item does not contain a rendered visual asset.")
    signed_item = planetary_computer.sign(item)
    array = None
    try:
        array = rioxarray.open_rasterio(signed_item.assets["visual"].href)
        if bbox is not None:
            if array.rio.crs is None:
                raise Sentinel2RequestError("The visual asset has no CRS.")
            transformer = Transformer.from_crs(
                "EPSG:4326", array.rio.crs, always_xy=True
            )
            native_bbox = transformer.transform_bounds(*bbox, densify_pts=21)
            array = array.rio.clip_box(
                minx=native_bbox[0],
                miny=native_bbox[1],
                maxx=native_bbox[2],
                maxy=native_bbox[3],
            )
        destination = Path(output_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        array.rio.to_raster(destination, driver="GTiff")
    finally:
        close = getattr(array, "close", None)
        if close is not None:
            close()

    return Path(output_path)
