"""Aligned GeoTIFF dataset discovery and loading."""

from __future__ import annotations

from contextlib import ExitStack
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, ContextManager, Mapping, Protocol, Sequence

import numpy as np


RASTER_SUFFIXES = {".tif", ".tiff"}
GAMUS_SUFFIX = ".h5"


class DatasetLayoutError(ValueError):
    """Raised when the expected dataset directory structure is invalid."""


class RasterAlignmentError(ValueError):
    """Raised when paired rasters do not describe the same pixel grid."""


class DatasetDependencyError(ImportError):
    """Raised when GeoTIFF loading is requested without Rasterio installed."""


class GamusDependencyError(ImportError):
    """Raised when GAMUS HDF5 loading is requested without h5py installed."""


class RasterSource(Protocol):
    """Small subset of a Rasterio dataset needed by this loader."""

    count: int
    height: int
    width: int
    crs: object
    transform: object
    profile: Mapping[str, object]

    def read(self, indexes: int | None = None) -> np.ndarray:
        """Read all bands or one selected band."""


RasterOpen = Callable[[str], ContextManager[RasterSource]]


@dataclass(frozen=True)
class TilePaths:
    """Paths for one RGB tile and its aligned label rasters."""

    rgb: Path
    height: Path
    semantic: Path | None = None


@dataclass(frozen=True)
class RasterSample:
    """One aligned sample, with images in channel-first layout."""

    image: np.ndarray
    height: np.ndarray
    semantic: np.ndarray | None
    metadata: Mapping[str, object]
    paths: TilePaths


@dataclass(frozen=True)
class GamusPaths:
    """Paths for one GAMUS RGB, class, and above-ground-height sample."""

    rgb: Path
    height: Path
    semantic: Path


@dataclass(frozen=True)
class GamusSample:
    """One GAMUS sample in channel-first layout with explicit AGL semantics."""

    image: np.ndarray
    height: np.ndarray
    semantic: np.ndarray
    metadata: Mapping[str, object]
    paths: GamusPaths
    height_reference: str = "above_ground"


@dataclass(frozen=True)
class GamusPatch:
    """A spatial crop from one GAMUS sample for model training or evaluation."""

    image: np.ndarray
    height: np.ndarray
    semantic: np.ndarray
    metadata: Mapping[str, object]
    source: GamusPaths
    height_reference: str = "above_ground"


def _matching_rasters(directory: Path, stem: str) -> list[Path]:
    return sorted(
        path
        for path in directory.glob(f"{stem}.*")
        if path.is_file() and path.suffix.lower() in RASTER_SUFFIXES
    )


def _find_match(directory: Path, stem: str, *, required: bool) -> Path | None:
    matches = _matching_rasters(directory, stem) if directory.is_dir() else []
    if len(matches) > 1:
        names = ", ".join(path.name for path in matches)
        raise DatasetLayoutError(f"Multiple rasters match tile '{stem}': {names}.")
    if not matches and required:
        raise DatasetLayoutError(
            f"Missing required raster for tile '{stem}' in '{directory}'."
        )
    return matches[0] if matches else None


def discover_tiles(dataset_root: str | Path, split: str = "train") -> tuple[TilePaths, ...]:
    """Discover RGB/height pairs under ``<root>/<split>``.

    The expected layout is ``rgb/``, ``height/``, and an optional ``semantic/``
    directory, with matching filename stems across directories.
    """

    split_root = Path(dataset_root) / split
    rgb_dir = split_root / "rgb"
    height_dir = split_root / "height"
    semantic_dir = split_root / "semantic"
    if not rgb_dir.is_dir():
        raise DatasetLayoutError(f"RGB directory does not exist: '{rgb_dir}'.")
    if not height_dir.is_dir():
        raise DatasetLayoutError(f"Height directory does not exist: '{height_dir}'.")

    rgb_files = sorted(
        path
        for path in rgb_dir.iterdir()
        if path.is_file() and path.suffix.lower() in RASTER_SUFFIXES
    )
    if not rgb_files:
        raise DatasetLayoutError(f"No GeoTIFF RGB tiles found in '{rgb_dir}'.")

    tiles = []
    for rgb_path in rgb_files:
        height_path = _find_match(height_dir, rgb_path.stem, required=True)
        semantic_path = _find_match(semantic_dir, rgb_path.stem, required=False)
        assert height_path is not None
        tiles.append(TilePaths(rgb_path, height_path, semantic_path))
    return tuple(tiles)


def discover_gamus_samples(
    dataset_root: str | Path,
    split: str = "train",
    *,
    scene_ids: Sequence[str] | None = None,
) -> tuple[GamusPaths, ...]:
    """Discover GAMUS ``RGB``, ``CLS``, and ``AGL`` HDF5 triplets.

    GAMUS stores each scene in separate directories and uses a shared scene
    identifier, for example ``DC_01_25_RGB.h5``, ``DC_01_25_CLS.h5``, and
    ``DC_01_25_AGL.h5``.
    """

    split_root = Path(dataset_root)
    image_dir = split_root / "images" / split
    class_dir = split_root / "classes" / split
    height_dir = split_root / "heights" / split
    for directory, label in (
        (image_dir, "image"),
        (class_dir, "class"),
        (height_dir, "height"),
    ):
        if not directory.is_dir():
            raise DatasetLayoutError(f"GAMUS {label} directory does not exist: '{directory}'.")

    rgb_files = sorted(
        path
        for path in image_dir.iterdir()
        if path.is_file() and path.name.endswith(f"_RGB{GAMUS_SUFFIX}")
    )
    if not rgb_files:
        raise DatasetLayoutError(f"No GAMUS RGB HDF5 samples found in '{image_dir}'.")

    requested_ids = set(scene_ids) if scene_ids is not None else None
    discovered_ids = set()
    samples = []
    for rgb_path in rgb_files:
        scene_id = rgb_path.name[: -len(f"_RGB{GAMUS_SUFFIX}")]
        discovered_ids.add(scene_id)
        if requested_ids is not None and scene_id not in requested_ids:
            continue
        class_path = class_dir / f"{scene_id}_CLS{GAMUS_SUFFIX}"
        height_path = height_dir / f"{scene_id}_AGL{GAMUS_SUFFIX}"
        if not class_path.is_file():
            raise DatasetLayoutError(f"Missing GAMUS class raster for scene '{scene_id}'.")
        if not height_path.is_file():
            raise DatasetLayoutError(f"Missing GAMUS AGL raster for scene '{scene_id}'.")
        samples.append(GamusPaths(rgb_path, height_path, class_path))
    if requested_ids is not None:
        missing = sorted(requested_ids - discovered_ids)
        if missing:
            raise DatasetLayoutError(
                f"Requested GAMUS scenes were not found in split '{split}': {', '.join(missing)}."
            )
        if not samples:
            raise DatasetLayoutError("The requested GAMUS scene selection is empty.")
    return tuple(samples)


def _read_gamus_image(path: Path) -> np.ndarray:
    try:
        import h5py
    except ImportError as exc:
        raise GamusDependencyError(
            "GAMUS HDF5 loading requires h5py. Install the project dependencies."
        ) from exc

    with h5py.File(path, "r") as source:
        if "image" not in source:
            raise RasterAlignmentError(f"GAMUS file '{path}' has no 'image' dataset.")
        return np.asarray(source["image"][()])


def crop_gamus_sample(
    sample: GamusSample,
    *,
    top: int,
    left: int,
    patch_size: int,
) -> GamusPatch:
    """Crop aligned RGB, AGL, and class arrays from one GAMUS sample."""

    if patch_size < 1:
        raise DatasetLayoutError("patch_size must be positive.")
    height, width = sample.height.shape
    if top < 0 or left < 0 or top + patch_size > height or left + patch_size > width:
        raise RasterAlignmentError("Requested GAMUS patch lies outside the sample.")

    return GamusPatch(
        image=sample.image[:, top : top + patch_size, left : left + patch_size],
        height=sample.height[top : top + patch_size, left : left + patch_size],
        semantic=sample.semantic[top : top + patch_size, left : left + patch_size],
        metadata={
            **sample.metadata,
            "scene_id": sample.paths.rgb.name.removesuffix("_RGB.h5"),
            "window": (top, left, patch_size, patch_size),
        },
        source=sample.paths,
        height_reference=sample.height_reference,
    )


class GamusPatchDataset:
    """Deterministically sample fixed-size patches from GAMUS scenes."""

    def __init__(
        self,
        dataset_root: str | Path,
        split: str = "train",
        *,
        patch_size: int = 384,
        patches_per_scene: int = 8,
        seed: int = 42,
        scene_ids: Sequence[str] | None = None,
        height_aware: bool = False,
        max_sampling_attempts: int = 8,
        focus_classes: Sequence[int] | None = None,
        min_focus_fraction: float = 0.1,
    ) -> None:
        if patch_size < 1:
            raise DatasetLayoutError("patch_size must be positive.")
        if patches_per_scene < 1:
            raise DatasetLayoutError("patches_per_scene must be positive.")
        if max_sampling_attempts < 1:
            raise DatasetLayoutError("max_sampling_attempts must be positive.")
        if not 0 <= min_focus_fraction <= 1:
            raise DatasetLayoutError("min_focus_fraction must be between 0 and 1.")
        self.dataset = GamusH5Dataset(dataset_root, split, scene_ids=scene_ids)
        self.patch_size = patch_size
        self.patches_per_scene = patches_per_scene
        self.seed = seed
        self.height_aware = height_aware
        self.max_sampling_attempts = max_sampling_attempts
        self.focus_classes = tuple(sorted(set(focus_classes or ())))
        self.min_focus_fraction = min_focus_fraction

    def __len__(self) -> int:
        return len(self.dataset) * self.patches_per_scene

    def __getitem__(self, index: int) -> GamusPatch:
        if index < 0 or index >= len(self):
            raise IndexError(index)
        scene_index, _ = divmod(index, self.patches_per_scene)
        sample = self.dataset[scene_index]
        height, width = sample.height.shape
        if self.patch_size > height or self.patch_size > width:
            raise RasterAlignmentError(
                f"Patch size {self.patch_size} exceeds GAMUS sample shape "
                f"{sample.height.shape}."
            )
        generator = np.random.default_rng(self.seed + index)
        top = 0
        left = 0
        selected_height = None
        for _ in range(self.max_sampling_attempts if self.height_aware else 1):
            top = int(generator.integers(0, height - self.patch_size + 1))
            left = int(generator.integers(0, width - self.patch_size + 1))
            selected_height = sample.height[
                top : top + self.patch_size,
                left : left + self.patch_size,
            ]
            selected_semantic = sample.semantic[
                top : top + self.patch_size,
                left : left + self.patch_size,
            ]
            if not self.height_aware:
                height_ok = True
            else:
                valid = np.isfinite(selected_height)
                height_ok = (
                    valid.mean() >= 0.5
                    and np.nanstd(selected_height) >= 2.0
                    and np.nanmax(selected_height) >= 5.0
                )
            focus_ok = (
                not self.focus_classes
                or np.isin(selected_semantic, self.focus_classes).mean()
                >= self.min_focus_fraction
            )
            if height_ok and focus_ok:
                break
        return crop_gamus_sample(
            sample,
            top=top,
            left=left,
            patch_size=self.patch_size,
        )


class GamusH5Dataset:
    """Load GAMUS HDF5 triplets without pretending they are georeferenced."""

    def __init__(
        self,
        dataset_root: str | Path,
        split: str = "train",
        *,
        scene_ids: Sequence[str] | None = None,
    ) -> None:
        self.samples = discover_gamus_samples(dataset_root, split, scene_ids=scene_ids)

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int) -> GamusSample:
        paths = self.samples[index]
        image = _read_gamus_image(paths.rgb)
        semantic = _read_gamus_image(paths.semantic)
        height = _read_gamus_image(paths.height)

        if image.ndim != 3 or image.shape[-1] != 3:
            raise RasterAlignmentError(
                f"GAMUS RGB file '{paths.rgb}' must have shape (height, width, 3)."
            )
        expected_shape = image.shape[:2]
        if semantic.shape != expected_shape:
            raise RasterAlignmentError(
                f"GAMUS class file '{paths.semantic}' has shape {semantic.shape}; "
                f"expected {expected_shape}."
            )
        if height.shape != expected_shape:
            raise RasterAlignmentError(
                f"GAMUS AGL file '{paths.height}' has shape {height.shape}; "
                f"expected {expected_shape}."
            )

        # GAMUS uses negative sentinels (notably -5), NaN, and occasional
        # infinite values for pixels without a valid above-ground-height
        # target. Keep all missing targets explicit so training and evaluation
        # can exclude them through their finite masks.
        height = height.astype(np.float32, copy=False)
        invalid_height = ~np.isfinite(height) | (height < 0)
        if np.any(invalid_height):
            height = height.copy()
            height[invalid_height] = np.nan

        return GamusSample(
            image=image.transpose(2, 0, 1).astype(np.float32, copy=False),
            height=height,
            semantic=semantic.astype(np.int64, copy=False),
            metadata={
                "format": "GAMUS_H5",
                "split": paths.rgb.parent.name,
                "georeferenced": False,
            },
            paths=paths,
        )


def _default_raster_open(path: str) -> ContextManager[RasterSource]:
    try:
        import rasterio
    except ImportError as exc:
        raise DatasetDependencyError(
            "GeoTIFF loading requires Rasterio. Install the project dependencies."
        ) from exc
    return rasterio.open(path)


def _read_rgb(source: RasterSource, path: Path) -> np.ndarray:
    image = np.asarray(source.read())
    if image.ndim != 3 or image.shape[0] < 3:
        raise RasterAlignmentError(
            f"RGB raster '{path}' must contain at least three bands."
        )
    return image[:3].astype(np.float32, copy=False)


def _read_band(source: RasterSource, path: Path, label: str) -> np.ndarray:
    band = np.asarray(source.read(1))
    if band.ndim != 2:
        raise RasterAlignmentError(f"{label} raster '{path}' must contain one band.")
    return band


def _validate_alignment(
    reference: RasterSource,
    candidate: RasterSource,
    candidate_path: Path,
    expected_shape: tuple[int, int],
) -> None:
    candidate_shape = (int(candidate.height), int(candidate.width))
    if candidate_shape != expected_shape:
        raise RasterAlignmentError(
            f"Raster '{candidate_path}' has shape {candidate_shape}; "
            f"expected {expected_shape}."
        )
    if candidate.crs != reference.crs:
        raise RasterAlignmentError(f"Raster '{candidate_path}' has a different CRS.")
    if candidate.transform != reference.transform:
        raise RasterAlignmentError(
            f"Raster '{candidate_path}' has a different geospatial transform."
        )


class GeoTiffDataset:
    """Index and load aligned RGB, height, and optional semantic rasters."""

    def __init__(
        self,
        dataset_root: str | Path,
        split: str = "train",
        *,
        raster_open: RasterOpen | None = None,
    ) -> None:
        self.tiles = discover_tiles(dataset_root, split)
        self._raster_open = raster_open or _default_raster_open

    def __len__(self) -> int:
        return len(self.tiles)

    def __getitem__(self, index: int) -> RasterSample:
        paths = self.tiles[index]
        with ExitStack() as stack:
            rgb_source = stack.enter_context(self._raster_open(str(paths.rgb)))
            height_source = stack.enter_context(self._raster_open(str(paths.height)))
            semantic_source = None
            if paths.semantic is not None:
                semantic_source = stack.enter_context(
                    self._raster_open(str(paths.semantic))
                )

            image = _read_rgb(rgb_source, paths.rgb)
            expected_shape = (int(rgb_source.height), int(rgb_source.width))
            if image.shape[1:] != expected_shape:
                raise RasterAlignmentError(
                    f"RGB raster '{paths.rgb}' data shape does not match its metadata."
                )
            _validate_alignment(
                rgb_source,
                height_source,
                paths.height,
                expected_shape,
            )
            height = _read_band(height_source, paths.height, "Height")

            semantic = None
            if semantic_source is not None and paths.semantic is not None:
                _validate_alignment(
                    rgb_source,
                    semantic_source,
                    paths.semantic,
                    expected_shape,
                )
                semantic = _read_band(semantic_source, paths.semantic, "Semantic")

            metadata = dict(rgb_source.profile)

        return RasterSample(
            image=image,
            height=height.astype(np.float32, copy=False),
            semantic=semantic,
            metadata=metadata,
            paths=paths,
        )
