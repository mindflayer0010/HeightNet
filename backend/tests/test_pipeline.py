from pathlib import Path

import numpy as np
import pytest

from backend.pipeline import InputKind, PipelineInputError, describe_input


def test_describe_png_as_relative(tmp_path: Path):
    image = pytest.importorskip("PIL.Image")
    path = tmp_path / "scene.png"
    image.new("RGB", (12, 8)).save(path)

    description = describe_input(path)

    assert description.kind is InputKind.RELATIVE
    assert (description.width, description.height) == (12, 8)
    assert description.crs is None


def test_describe_geotiff_as_georeferenced(tmp_path: Path):
    rasterio = pytest.importorskip("rasterio")
    from rasterio.transform import from_origin

    path = tmp_path / "scene.tif"
    profile = {
        "driver": "GTiff",
        "height": 8,
        "width": 12,
        "count": 3,
        "dtype": "uint8",
        "crs": "EPSG:32643",
        "transform": from_origin(500000, 4000000, 10, 10),
    }
    with rasterio.open(path, "w", **profile) as destination:
        destination.write(np.zeros((3, 8, 12), dtype=np.uint8))

    description = describe_input(path)

    assert description.kind is InputKind.GEOREFERENCED
    assert description.crs == "EPSG:32643"


def test_describe_rejects_unknown_extension(tmp_path: Path):
    path = tmp_path / "scene.bmp"
    path.write_bytes(b"not an input")

    with pytest.raises(PipelineInputError, match="Supported inputs"):
        describe_input(path)
