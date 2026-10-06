import numpy as np
import pytest

from backend.geo.raster import write_float_geotiff, write_single_band_geotiff


def test_write_single_band_geotiff_rejects_wrong_shape(tmp_path):
    rasterio = pytest.importorskip("rasterio")
    from rasterio.transform import from_origin

    reference = tmp_path / "reference.tif"
    profile = {
        "driver": "GTiff",
        "height": 4,
        "width": 5,
        "count": 3,
        "dtype": "uint8",
        "crs": "EPSG:32643",
        "transform": from_origin(0, 40, 10, 10),
    }
    with rasterio.open(reference, "w", **profile) as source:
        source.write(np.zeros((3, 4, 5), dtype=np.uint8))

    with pytest.raises(ValueError, match="expected"):
        write_single_band_geotiff(
            reference,
            tmp_path / "output.tif",
            np.zeros((2, 2), dtype=np.float32),
            description="test",
        )


def test_write_float_geotiff_can_create_unreferenced_relative_output(tmp_path):
    rasterio = pytest.importorskip("rasterio")

    output = write_float_geotiff(
        tmp_path / "relative.tif",
        np.array([[1.0, np.nan], [3.0, 4.0]], dtype=np.float32),
        description="relative",
    )

    with rasterio.open(output) as source:
        assert source.count == 1
        assert source.crs is None
        assert source.read(1)[0, 1] == -9999.0
        assert source.descriptions[0] == "relative"
