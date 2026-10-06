import numpy as np
import pytest

from scripts.validate_dsm_outputs import validate


def _write(path, *, width=5, height=4, transform=None):
    rasterio = pytest.importorskip("rasterio")
    from rasterio.transform import from_origin

    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=1,
        dtype="float32",
        crs="EPSG:32643",
        transform=transform or from_origin(0, 40, 10, 10),
        nodata=-9999,
    ) as destination:
        destination.write(np.ones((1, height, width), dtype=np.float32))


def test_validate_accepts_aligned_single_band_products(tmp_path):
    reference = tmp_path / "rgb.tif"
    rasterio = pytest.importorskip("rasterio")
    from rasterio.transform import from_origin

    with rasterio.open(
        reference,
        "w",
        driver="GTiff",
        height=4,
        width=5,
        count=3,
        dtype="uint8",
        crs="EPSG:32643",
        transform=from_origin(0, 40, 10, 10),
    ) as destination:
        destination.write(np.zeros((3, 4, 5), dtype=np.uint8))

    products = {}
    for name in ("agl", "ground", "dsm"):
        products[name] = tmp_path / f"{name}.tif"
        _write(products[name])

    report = validate(reference, products)
    assert report["rasters"]["dsm"]["shape"] == [4, 5]
    assert report["rasters"]["dsm"]["valid_fraction"] == 1.0


def test_validate_rejects_misaligned_product(tmp_path):
    reference = tmp_path / "rgb.tif"
    rasterio = pytest.importorskip("rasterio")
    from rasterio.transform import from_origin

    with rasterio.open(
        reference,
        "w",
        driver="GTiff",
        height=4,
        width=5,
        count=3,
        dtype="uint8",
        crs="EPSG:32643",
        transform=from_origin(0, 40, 10, 10),
    ) as destination:
        destination.write(np.zeros((3, 4, 5), dtype=np.uint8))

    aligned = tmp_path / "aligned.tif"
    _write(aligned)
    shifted = tmp_path / "shifted.tif"
    _write(shifted, transform=from_origin(10, 40, 10, 10))

    with pytest.raises(ValueError, match="transform"):
        validate(reference, {"agl": shifted, "ground": aligned, "dsm": aligned})
