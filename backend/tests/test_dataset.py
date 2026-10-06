from pathlib import Path

import h5py
import numpy as np
import pytest

from backend.data.dataset import (
    DatasetLayoutError,
    GeoTiffDataset,
    RasterAlignmentError,
    discover_tiles,
    GamusH5Dataset,
    GamusPatchDataset,
    discover_gamus_samples,
)
from backend.data.sentinel2 import Sentinel2RequestError, _validate_bbox
from backend.data.splits import split_scene_ids


def test_sentinel2_bbox_validation() -> None:
    assert _validate_bbox((77.3, 28.5, 77.4, 28.6)) == (77.3, 28.5, 77.4, 28.6)

    with pytest.raises(Sentinel2RequestError):
        _validate_bbox((77.4, 28.5, 77.3, 28.6))


def _write_gamus_fixture(tmp_path: Path) -> Path:
    for directory in ("images", "classes", "heights"):
        (tmp_path / directory / "train").mkdir(parents=True)
    write_gamus_file(
        tmp_path / "images" / "train" / "scene_RGB.h5",
        np.zeros((8, 9, 3), dtype=np.uint8),
    )
    write_gamus_file(
        tmp_path / "classes" / "train" / "scene_CLS.h5",
        np.ones((8, 9), dtype=np.float32),
    )
    write_gamus_file(
        tmp_path / "heights" / "train" / "scene_AGL.h5",
        np.ones((8, 9), dtype=np.float32),
    )
    return tmp_path


def test_gamus_patch_dataset_is_aligned_and_deterministic(tmp_path):
    root = _write_gamus_fixture(tmp_path)

    patches = GamusPatchDataset(root, patch_size=4, patches_per_scene=2, seed=7)
    first = patches[0]
    same_first = patches[0]

    assert len(patches) == 2
    assert first.image.shape == (3, 4, 4)
    assert first.height.shape == (4, 4)
    assert first.semantic.shape == (4, 4)
    assert first.metadata["scene_id"] == "scene"
    np.testing.assert_array_equal(first.image, same_first.image)


def test_gamus_patch_dataset_can_prefer_height_variation(tmp_path):
    root = _write_gamus_fixture(tmp_path)
    height = np.tile(np.arange(8, dtype=np.float32)[:, None] * 3.0, (1, 9))
    write_gamus_file(
        root / "heights" / "train" / "scene_AGL.h5",
        height,
    )

    patches = GamusPatchDataset(
        root,
        patch_size=4,
        patches_per_scene=2,
        seed=7,
        height_aware=True,
    )
    patch = patches[0]

    assert np.nanstd(patch.height) >= 2.0
    assert np.nanmax(patch.height) >= 5.0


def test_gamus_patch_dataset_can_focus_on_semantic_classes(tmp_path):
    root = _write_gamus_fixture(tmp_path)
    classes = np.zeros((8, 9), dtype=np.float32)
    classes[2:6, 2:6] = 6
    write_gamus_file(
        root / "classes" / "train" / "scene_CLS.h5",
        classes,
    )

    patches = GamusPatchDataset(
        root,
        patch_size=4,
        patches_per_scene=2,
        seed=7,
        focus_classes=(6,),
        min_focus_fraction=0.1,
    )
    patch = patches[0]

    assert np.isin(patch.semantic, (6,)).mean() >= 0.1


def test_scene_split_is_deterministic_and_disjoint():
    scene_ids = [f"scene_{index}" for index in range(16)]

    first = split_scene_ids(scene_ids, seed=11)
    second = split_scene_ids(scene_ids, seed=11)

    assert first == second
    assert len(first.train) == 12
    assert len(first.validation) == 2
    assert len(first.test) == 2
    assert not set(first.train) & set(first.validation)
    assert not set(first.train) & set(first.test)
    assert not set(first.validation) & set(first.test)


class FakeRaster:
    def __init__(self, data, *, crs="EPSG:32643", transform="grid"):
        self._data = np.asarray(data)
        self.count = self._data.shape[0]
        self.height = self._data.shape[-2]
        self.width = self._data.shape[-1]
        self.crs = crs
        self.transform = transform
        self.profile = {
            "count": self.count,
            "height": self.height,
            "width": self.width,
            "crs": crs,
            "transform": transform,
        }

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self, indexes=None):
        if indexes is None:
            return self._data
        return self._data[indexes - 1]


def create_layout(tmp_path: Path, *, semantic=True):
    for directory in ("rgb", "height"):
        (tmp_path / "train" / directory).mkdir(parents=True)
    if semantic:
        (tmp_path / "train" / "semantic").mkdir()
    (tmp_path / "train" / "rgb" / "tile001.tif").touch()
    (tmp_path / "train" / "height" / "tile001.tiff").touch()
    if semantic:
        (tmp_path / "train" / "semantic" / "tile001.tif").touch()


def test_discover_tiles_matches_stems_and_extensions(tmp_path):
    create_layout(tmp_path)

    tiles = discover_tiles(tmp_path)

    assert len(tiles) == 1
    assert tiles[0].rgb.name == "tile001.tif"
    assert tiles[0].height.name == "tile001.tiff"
    assert tiles[0].semantic is not None


def test_dataset_reads_channel_first_aligned_sample(tmp_path):
    create_layout(tmp_path)
    rgb = np.arange(36).reshape(3, 3, 4)
    height = np.arange(12).reshape(3, 4)
    semantic = np.ones((3, 4), dtype=np.uint8)
    sources = {
        str(tmp_path / "train" / "rgb" / "tile001.tif"): FakeRaster(rgb),
        str(tmp_path / "train" / "height" / "tile001.tiff"): FakeRaster(
            height[np.newaxis, ...]
        ),
        str(tmp_path / "train" / "semantic" / "tile001.tif"): FakeRaster(
            semantic[np.newaxis, ...]
        ),
    }

    dataset = GeoTiffDataset(tmp_path, raster_open=sources.__getitem__)
    sample = dataset[0]

    assert sample.image.shape == (3, 3, 4)
    assert sample.image.dtype == np.float32
    np.testing.assert_array_equal(sample.height, height)
    np.testing.assert_array_equal(sample.semantic, semantic)
    assert sample.metadata["crs"] == "EPSG:32643"


def test_dataset_rejects_misaligned_height(tmp_path):
    create_layout(tmp_path, semantic=False)
    sources = {
        str(tmp_path / "train" / "rgb" / "tile001.tif"): FakeRaster(
            np.zeros((3, 3, 4))
        ),
        str(tmp_path / "train" / "height" / "tile001.tiff"): FakeRaster(
            np.zeros((1, 2, 4))
        ),
    }

    dataset = GeoTiffDataset(tmp_path, raster_open=sources.__getitem__)

    with pytest.raises(RasterAlignmentError, match=r"expected \(3, 4\)"):
        dataset[0]


def test_discover_tiles_requires_height_pair(tmp_path):
    (tmp_path / "train" / "rgb").mkdir(parents=True)
    (tmp_path / "train" / "height").mkdir()
    (tmp_path / "train" / "rgb" / "tile001.tif").touch()

    with pytest.raises(DatasetLayoutError, match="Missing required raster"):
        discover_tiles(tmp_path)


def write_gamus_file(path: Path, data: np.ndarray) -> None:
    with h5py.File(path, "w") as source:
        source.create_dataset("image", data=data)


def test_gamus_loader_reads_rgb_class_and_agl_triplet(tmp_path):
    for directory in ("images", "classes", "heights"):
        (tmp_path / directory / "train").mkdir(parents=True)

    rgb = np.zeros((4, 5, 3), dtype=np.uint8)
    classes = np.ones((4, 5), dtype=np.float32)
    agl = np.full((4, 5), 12.5, dtype=np.float32)
    write_gamus_file(tmp_path / "images" / "train" / "DC_01_25_RGB.h5", rgb)
    write_gamus_file(tmp_path / "classes" / "train" / "DC_01_25_CLS.h5", classes)
    write_gamus_file(tmp_path / "heights" / "train" / "DC_01_25_AGL.h5", agl)

    samples = discover_gamus_samples(tmp_path)
    sample = GamusH5Dataset(tmp_path)[0]

    assert len(samples) == 1
    assert sample.image.shape == (3, 4, 5)
    assert sample.height_reference == "above_ground"
    assert sample.metadata["georeferenced"] is False
    np.testing.assert_array_equal(sample.height, agl)


def test_gamus_loader_masks_negative_agl_sentinel(tmp_path):
    for directory in ("images", "classes", "heights"):
        (tmp_path / directory / "train").mkdir(parents=True)

    write_gamus_file(
        tmp_path / "images" / "train" / "scene_RGB.h5",
        np.zeros((2, 3, 3), dtype=np.uint8),
    )
    write_gamus_file(
        tmp_path / "classes" / "train" / "scene_CLS.h5",
        np.ones((2, 3), dtype=np.float32),
    )
    write_gamus_file(
        tmp_path / "heights" / "train" / "scene_AGL.h5",
        np.array([[0.0, 4.0, -5.0], [2.0, -1.0, 8.0]], dtype=np.float32),
    )

    sample = GamusH5Dataset(tmp_path)[0]

    assert np.isnan(sample.height[0, 2])
    assert np.isnan(sample.height[1, 1])
    np.testing.assert_array_equal(
        sample.height[np.isfinite(sample.height)],
        np.array([0.0, 4.0, 2.0, 8.0], dtype=np.float32),
    )


def test_gamus_loader_masks_nonfinite_agl_values(tmp_path):
    for directory in ("images", "classes", "heights"):
        (tmp_path / directory / "train").mkdir(parents=True)

    write_gamus_file(
        tmp_path / "images" / "train" / "scene_RGB.h5",
        np.zeros((2, 2, 3), dtype=np.uint8),
    )
    write_gamus_file(
        tmp_path / "classes" / "train" / "scene_CLS.h5",
        np.ones((2, 2), dtype=np.float32),
    )
    write_gamus_file(
        tmp_path / "heights" / "train" / "scene_AGL.h5",
        np.array([[1.0, np.inf], [np.nan, 4.0]], dtype=np.float32),
    )

    sample = GamusH5Dataset(tmp_path)[0]

    assert np.isfinite(sample.height[0, 0])
    assert np.isnan(sample.height[0, 1])
    assert np.isnan(sample.height[1, 0])


def test_gamus_loader_rejects_misaligned_height(tmp_path):
    for directory in ("images", "classes", "heights"):
        (tmp_path / directory / "train").mkdir(parents=True)

    write_gamus_file(
        tmp_path / "images" / "train" / "DC_01_25_RGB.h5",
        np.zeros((4, 5, 3), dtype=np.uint8),
    )
    write_gamus_file(
        tmp_path / "classes" / "train" / "DC_01_25_CLS.h5",
        np.zeros((4, 5), dtype=np.float32),
    )
    write_gamus_file(
        tmp_path / "heights" / "train" / "DC_01_25_AGL.h5",
        np.zeros((3, 5), dtype=np.float32),
    )

    with pytest.raises(RasterAlignmentError, match=r"expected \(4, 5\)"):
        GamusH5Dataset(tmp_path)[0]
