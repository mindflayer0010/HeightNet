import numpy as np
import pytest

from backend.visualization.mesh import export_obj_mesh


def test_export_obj_mesh_writes_textured_grid(tmp_path):
    rasterio = pytest.importorskip("rasterio")
    from rasterio.transform import from_origin

    transform = from_origin(100, 200, 10, 10)
    rgb_path = tmp_path / "rgb.tif"
    elevation_path = tmp_path / "dsm.tif"
    profile = {
        "driver": "GTiff",
        "height": 4,
        "width": 5,
        "crs": "EPSG:32643",
        "transform": transform,
    }
    with rasterio.open(rgb_path, "w", count=3, dtype="uint8", **profile) as source:
        source.write(np.zeros((3, 4, 5), dtype=np.uint8))
    with rasterio.open(
        elevation_path,
        "w",
        count=1,
        dtype="float32",
        nodata=-9999,
        **profile,
    ) as source:
        source.write(np.arange(20, dtype=np.float32).reshape(1, 4, 5))

    result = export_obj_mesh(rgb_path, elevation_path, tmp_path / "terrain.obj", stride=2)

    assert result.vertex_count == 9
    assert result.face_count == 8
    assert result.obj_path.is_file()
    assert result.material_path.is_file()
    assert result.texture_path.is_file()
    assert "map_Kd terrain_texture.png" in result.material_path.read_text()


def test_export_obj_mesh_uses_shared_rgb_texture_stretch(tmp_path):
    rasterio = pytest.importorskip("rasterio")
    from PIL import Image
    from rasterio.transform import from_origin

    transform = from_origin(100, 200, 10, 10)
    rgb_path = tmp_path / "rgb.tif"
    elevation_path = tmp_path / "dsm.tif"
    profile = {
        "driver": "GTiff",
        "height": 2,
        "width": 2,
        "crs": "EPSG:32643",
        "transform": transform,
    }
    with rasterio.open(rgb_path, "w", count=3, dtype="uint16", **profile) as source:
        source.write(
            np.array(
                [
                    [[100, 200], [300, 400]],
                    [[110, 210], [310, 410]],
                    [[120, 220], [320, 420]],
                ],
                dtype=np.uint16,
            )
        )
    with rasterio.open(
        elevation_path,
        "w",
        count=1,
        dtype="float32",
        nodata=-9999,
        **profile,
    ) as source:
        source.write(np.ones((1, 2, 2), dtype=np.float32))

    result = export_obj_mesh(rgb_path, elevation_path, tmp_path / "terrain.obj", stride=1)
    texture = np.asarray(Image.open(result.texture_path))
    assert texture.shape == (2, 2, 3)
    assert float(texture[..., 0].mean()) < float(texture[..., 1].mean())
    assert float(texture[..., 1].mean()) < float(texture[..., 2].mean())
