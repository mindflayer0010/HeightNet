"""Export aligned RGB and elevation rasters as a textured terrain mesh."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path

import numpy as np


@dataclass(frozen=True)
class MeshExportResult:
    obj_path: Path
    material_path: Path
    texture_path: Path
    metadata_path: Path
    vertex_count: int
    face_count: int


def _read_visual_rgb(path: str | Path) -> np.ndarray:
    """Read RGB bands with one shared stretch for a natural texture.

    Model preprocessing may stretch each band independently, but doing that to
    the displayed texture changes the colour balance and makes Sentinel-2
    imagery look falsely coloured. A shared radiometric range preserves the
    relative red/green/blue balance for the viewer.
    """

    import rasterio

    with rasterio.open(path) as source:
        bands = source.read((1, 2, 3), masked=True).astype(np.float32)
    valid = bands.compressed()
    if valid.size == 0:
        return np.zeros((*bands.shape[1:], 3), dtype=np.uint8)
    maximum = float(np.percentile(valid, 99.5))
    if maximum <= 1.5:
        low = 0.0
        high = 1.0
    elif maximum <= 255.0:
        low = 0.0
        high = 255.0
    else:
        # Sentinel-2 surface-reflectance DNs are commonly stored on a 0-10000
        # scale. Use a fixed display ceiling instead of the scene maximum.
        # Clouds and snow can be much brighter than ordinary land; using the
        # maximum would squash most of the terrain into black pixels.
        low = min(1000.0, float(np.percentile(valid, 2)))
        high = 3000.0
    scaled = np.clip((bands.astype(np.float32) - low) / (high - low), 0.0, 1.0)
    return np.moveaxis(np.ma.filled(scaled, 0.0) * 255.0, 0, -1).astype(np.uint8)


def export_obj_mesh(
    rgb_path: str | Path,
    elevation_path: str | Path,
    output_obj: str | Path,
    *,
    stride: int = 4,
    vertical_exaggeration: float = 1.0,
) -> MeshExportResult:
    """Export a decimated grid mesh with RGB texture coordinates.

    Mesh coordinates use local projected metres when the source has a CRS.
    Elevation is offset by the minimum valid value to avoid unnecessarily large
    vertex coordinates; the offset is recorded in the metadata sidecar.
    """

    if stride < 1:
        raise ValueError("stride must be positive.")
    if vertical_exaggeration <= 0:
        raise ValueError("vertical_exaggeration must be positive.")

    try:
        import rasterio
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Mesh export requires Rasterio and Pillow.") from exc

    rgb_path = Path(rgb_path)
    elevation_path = Path(elevation_path)
    obj_path = Path(output_obj)
    obj_path.parent.mkdir(parents=True, exist_ok=True)
    material_path = obj_path.with_suffix(".mtl")
    texture_path = obj_path.with_name(f"{obj_path.stem}_texture.png")
    metadata_path = obj_path.with_name(f"{obj_path.stem}_metadata.json")

    with rasterio.open(rgb_path) as rgb_source:
        if rgb_source.count < 3:
            raise ValueError("RGB input must contain at least three bands.")
        rgb_height, rgb_width = rgb_source.height, rgb_source.width
        rgb_transform = rgb_source.transform
    with rasterio.open(elevation_path) as elevation_source:
        if elevation_source.count != 1:
            raise ValueError("Elevation input must be single-band.")
        if (elevation_source.height, elevation_source.width) != (rgb_height, rgb_width):
            raise ValueError("RGB and elevation rasters must share the same grid.")
        elevation = elevation_source.read(1).astype(np.float64)
        elevation_transform = elevation_source.transform
        elevation_crs = elevation_source.crs
        nodata = elevation_source.nodata

    if rgb_transform != elevation_transform:
        raise ValueError("RGB and elevation transforms must match.")
    valid = np.isfinite(elevation)
    if nodata is not None:
        valid &= elevation != nodata
    if not valid.any():
        raise ValueError("Elevation raster contains no valid values.")

    rows = np.arange(0, rgb_height, stride, dtype=int)
    cols = np.arange(0, rgb_width, stride, dtype=int)
    if rows[-1] != rgb_height - 1:
        rows = np.append(rows, rgb_height - 1)
    if cols[-1] != rgb_width - 1:
        cols = np.append(cols, rgb_width - 1)
    sampled = elevation[np.ix_(rows, cols)]
    sampled = np.nan_to_num(sampled, nan=float(np.nanmedian(elevation[valid])))
    base_elevation = float(np.nanmin(elevation[valid]))
    height_range = float(np.nanmax(elevation[valid]) - base_elevation)

    row_grid, col_grid = np.meshgrid(rows, cols, indexing="ij")
    x = (
        rgb_transform.c
        + rgb_transform.a * col_grid
        + rgb_transform.b * row_grid
    )
    y = (
        rgb_transform.f
        + rgb_transform.d * col_grid
        + rgb_transform.e * row_grid
    )
    x = x - float(np.nanmin(x))
    y = y - float(np.nanmin(y))
    z = (sampled - base_elevation) * vertical_exaggeration

    # A non-georeferenced raster has no metre-based horizontal or vertical
    # scale. Its relative height signal is still useful for a 3D preview, but
    # at a literal 1:1 display scale it looks almost flat. Store a suggested
    # visual multiplier for the browser viewer instead of pretending the
    # relative values are metres.
    metric_scale = elevation_crs is not None
    horizontal_extent = max(float(np.ptp(x)), float(np.ptp(y)), 1.0)
    recommended_vertical_exaggeration = 1.0
    if not metric_scale and height_range > 1e-6:
        recommended_vertical_exaggeration = float(
            np.clip(0.12 * horizontal_extent / height_range, 8.0, 80.0)
        )

    texture = _read_visual_rgb(rgb_path)
    Image.fromarray(texture, mode="RGB").save(texture_path)

    mesh_rows, mesh_cols = sampled.shape
    vertex_count = mesh_rows * mesh_cols
    face_count = (mesh_rows - 1) * (mesh_cols - 1) * 2
    with obj_path.open("w", encoding="utf-8", newline="\n") as obj:
        obj.write(f"mtllib {material_path.name}\n")
        for index in range(vertex_count):
            obj.write(f"v {x.flat[index]:.6f} {y.flat[index]:.6f} {z.flat[index]:.6f}\n")
        for row in range(mesh_rows):
            v = 1.0 - row / max(mesh_rows - 1, 1)
            for col in range(mesh_cols):
                u = col / max(mesh_cols - 1, 1)
                obj.write(f"vt {u:.6f} {v:.6f}\n")
        obj.write("usemtl terrain\n")
        for row in range(mesh_rows - 1):
            for col in range(mesh_cols - 1):
                a = row * mesh_cols + col + 1
                b = a + 1
                d = (row + 1) * mesh_cols + col + 1
                c = d + 1
                obj.write(f"f {a}/{a} {b}/{b} {c}/{c}\n")
                obj.write(f"f {a}/{a} {c}/{c} {d}/{d}\n")

    material_path.write_text(
        "newmtl terrain\n"
        "Ka 1.000 1.000 1.000\n"
        "Kd 1.000 1.000 1.000\n"
        "Ks 0.000 0.000 0.000\n"
        f"map_Kd {texture_path.name}\n",
        encoding="utf-8",
    )
    metadata_path.write_text(
        json.dumps(
            {
                "rgb": str(rgb_path),
                "elevation": str(elevation_path),
                "crs": elevation_crs.to_string() if elevation_crs else None,
                "metric_scale": metric_scale,
                "height_mode": "metric" if metric_scale else "relative",
                "height_range": height_range,
                "recommended_vertical_exaggeration": recommended_vertical_exaggeration,
                "stride": stride,
                "vertical_exaggeration": vertical_exaggeration,
                "base_elevation_m": base_elevation,
                "vertex_count": vertex_count,
                "face_count": face_count,
                "height": rgb_height,
                "width": rgb_width,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return MeshExportResult(
        obj_path=obj_path,
        material_path=material_path,
        texture_path=texture_path,
        metadata_path=metadata_path,
        vertex_count=vertex_count,
        face_count=face_count,
    )
