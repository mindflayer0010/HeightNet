"""Discover elevation and validation sources for a selected WGS84 AOI.

The source registry deliberately separates three jobs:

* ``optical_input`` is the image that HeightNet predicts from.
* ``coarse_ground`` is an optional ground-elevation baseline used to build a
  metric DSM.
* ``validation_reference`` is independent LiDAR/DSM data used to score the
  result. It must not be silently used as an inference input.

Some Indian providers expose data through registration, ordering, or project
requests rather than a public AOI download API. Those providers are still
listed with ``request_required`` status so the user can see the real state.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import os
from pathlib import Path
import re
from typing import Any, Sequence
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.acquisition.stac import AcquisitionError, validate_bbox


OPENTOPOGRAPHY_RASTER_CATALOG = (
    "https://portal.opentopography.org/stac/raster_catalog.json"
)
OPENTOPOGRAPHY_CATALOG_API = "https://portal.opentopography.org/API/otCatalog"
OPENTOPOGRAPHY_DATA_CATALOG = "https://portal.opentopography.org/datasets"
BHOONIDHI_URL = "https://bhoonidhi.nrsc.gov.in/bhoonidhi/home.html"
NRSC_LIDAR_URL = "https://www.nrsc.gov.in/nrscnew/Services_ASDM_AirborneSensors.php"
CARTODEM_URL = "https://www.nrsc.gov.in/nrscnew/Dataproducts_Thematic_cartodem.php?lang_code=en"
CARTODSM_URL = "https://bhoonidhi.nrsc.gov.in/bhoonidhi_resources/help/UIM2024/9_UIM2024_CartoDSM.pdf"
NAKSHA_URL = "https://www.dilrmp.gov.in/chart/naksha-soi-dashboard"
DATA_GOV_URL = "https://data.gov.in/"

@dataclass(frozen=True)
class SourceRecord:
    """One source option shown to the UI and saved in provenance."""

    id: str
    name: str
    role: str
    status: str
    access: str
    provider: str
    detail: str
    url: str | None = None
    path: str | None = None
    resolution_m: float | None = None
    coverage: bool | None = None

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def _fetch_json(url: str, *, timeout: float = 8.0) -> dict[str, Any]:
    request = Request(url, headers={"User-Agent": "HeightNet/0.1 local student project"})
    try:
        with urlopen(request, timeout=timeout) as response:
            value = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise AcquisitionError(f"Source catalog request failed: {exc}") from exc
    if not isinstance(value, dict):
        raise AcquisitionError("Source catalog returned an unexpected response.")
    return value


def _bbox_intersects(
    left: Sequence[float], right: Sequence[float]
) -> bool:
    """Return whether two WGS84 bboxes intersect."""

    return not (
        float(left[2]) < float(right[0])
        or float(left[0]) > float(right[2])
        or float(left[3]) < float(right[1])
        or float(left[1]) > float(right[3])
    )


def _collection_bbox(collection: dict[str, Any]) -> list[float] | None:
    extent = collection.get("extent", {})
    spatial = extent.get("spatial", {}) if isinstance(extent, dict) else {}
    values = spatial.get("bbox") if isinstance(spatial, dict) else None
    if not isinstance(values, list) or not values:
        return None
    first = values[0] if isinstance(values[0], list) else values
    if not isinstance(first, list) or len(first) != 4:
        return None
    try:
        return [float(value) for value in first]
    except (TypeError, ValueError):
        return None


def _load_opentopography_catalog(bbox: Sequence[float]) -> list[dict[str, Any]]:
    """Query OpenTopography for raster products intersecting one AOI.

    The STAC raster catalog is useful for browsing, but loading every child
    collection for every map selection is unnecessarily slow. OpenTopography
    exposes the same catalog through a bbox endpoint, so the UI only asks for
    records that can actually overlap the selected area.
    """

    min_lon, min_lat, max_lon, max_lat = bbox
    query = (
        f"?minx={min_lon}&miny={min_lat}&maxx={max_lon}&maxy={max_lat}"
        "&productFormat=Raster&outputFormat=json"
    )
    response = _fetch_json(f"{OPENTOPOGRAPHY_CATALOG_API}{query}", timeout=20.0)
    datasets = response.get("Datasets", [])
    if not isinstance(datasets, list):
        raise AcquisitionError("OpenTopography returned an unexpected catalog response.")
    return [
        item["Dataset"]
        for item in datasets
        if isinstance(item, dict) and isinstance(item.get("Dataset"), dict)
    ]


def _opentopography_matches(bbox: Sequence[float]) -> list[SourceRecord]:
    """Find public OpenTopography raster collections covering the AOI."""

    try:
        datasets = _load_opentopography_catalog(bbox)
    except AcquisitionError as exc:
        return [
            SourceRecord(
                id="opentopography",
                name="OpenTopography catalog",
                role="validation_reference",
                status="unavailable",
                access="catalog_error",
                provider="OpenTopography",
                detail=str(exc),
                url=OPENTOPOGRAPHY_DATA_CATALOG,
                coverage=None,
            )
        ]

    matches: list[SourceRecord] = []
    for dataset in datasets:
        identifier = dataset.get("identifier", {})
        collection_id = str(
            identifier.get("value")
            if isinstance(identifier, dict) and identifier.get("value")
            else dataset.get("name") or "unknown"
        )
        name = str(dataset.get("name") or dataset.get("alternateName") or collection_id)
        alternate_name = str(dataset.get("alternateName") or "")
        description_lower = f"{name} {alternate_name}".lower()
        global_dem_markers = (
            "global dataset",
            "global digital surface model",
            "global dem",
            "copernicus dem",
            "copernicus glo",
            "nasadem",
            "shuttle radar topography",
            "alos world 3d",
            "gedi",
            "gebco",
            "bathymetry",
            "global ensemble digital terrain",
        )
        is_coarse_global = any(marker in description_lower for marker in global_dem_markers)
        resolution = None
        resolution_match = re.search(r"(?<!\d)(\d+(?:\.\d+)?)\s*m\b", description_lower)
        if resolution_match:
            resolution = float(resolution_match.group(1))
        description = (
            f"AOI match in the OpenTopography catalog: {name}. "
            + (
                "This is a coarse elevation option, not independent LiDAR truth."
                if is_coarse_global
                else "Use as an independent reference only; it is never fed into prediction."
            )
        )
        matches.append(
            SourceRecord(
                id=f"opentopography:{collection_id}",
                name=f"OpenTopography: {name}",
                role="coarse_ground" if is_coarse_global else "validation_reference",
                status="catalog_match" if is_coarse_global else "available",
                access="catalog",
                provider="OpenTopography",
                detail=description[:500],
                url=OPENTOPOGRAPHY_DATA_CATALOG,
                resolution_m=resolution,
                coverage=True,
            )
        )
    return matches


def _raster_covers_bbox(path: Path, bbox: Sequence[float]) -> bool | None:
    try:
        import rasterio
        from rasterio.warp import transform_bounds

        with rasterio.open(path) as dataset:
            if dataset.crs is None:
                return None
            bounds = transform_bounds(dataset.crs, "EPSG:4326", *dataset.bounds, densify_pts=21)
        return _bbox_intersects(bbox, bounds)
    except (ImportError, OSError, ValueError):
        return None


def _local_sources(repo_root: Path, bbox: Sequence[float]) -> list[SourceRecord]:
    roots = [
        repo_root / "data" / "reference",
        repo_root / "data" / "references",
        repo_root / "data" / "validation",
        repo_root / "data" / "ground_truth",
        repo_root / "data" / "lidar",
        repo_root / "data" / "gcps",
    ]
    allowed = {".tif", ".tiff", ".las", ".laz", ".csv"}
    results: list[SourceRecord] = []
    seen: set[Path] = set()
    for root in roots:
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in allowed:
                continue
            resolved = path.resolve()
            if resolved in seen:
                continue
            seen.add(resolved)
            relative = path.relative_to(repo_root).as_posix()
            suffix = path.suffix.lower()
            if suffix == ".csv":
                results.append(
                    SourceRecord(
                        id=f"local-gcp:{relative}",
                        name=f"Surveyed GCPs: {path.name}",
                        role="calibration_reference",
                        status="available",
                        access="local_upload",
                        provider="HeightNet workspace",
                        detail="Use selected points for calibration and keep separate points for testing.",
                        path=relative,
                        coverage=None,
                    )
                )
                continue

            coverage = _raster_covers_bbox(path, bbox)
            if coverage is False:
                continue
            is_lidar = suffix in {".las", ".laz"}
            results.append(
                SourceRecord(
                    id=f"local:{relative}",
                    name=f"{'LiDAR' if is_lidar else 'Reference raster'}: {path.name}",
                    role="validation_reference",
                    status="available",
                    access="local_file",
                    provider="HeightNet workspace",
                    detail="Local reference file matched the selected workspace source folder.",
                    path=relative,
                    coverage=coverage,
                )
            )
    return results


def _official_india_sources() -> list[SourceRecord]:
    return [
        SourceRecord(
            id="india:nrsc-lidar",
            name="NRSC airborne LiDAR",
            role="validation_reference",
            status="request_required",
            access="official_request",
            provider="ISRO / NRSC",
            detail="High-resolution airborne LiDAR/DSM data may be available for a surveyed project area.",
            url=NRSC_LIDAR_URL,
            coverage=None,
        ),
        SourceRecord(
            id="india:cartodsm",
            name="NRSC CartoDSM",
            role="validation_reference",
            status="request_required",
            access="registered_or_ordered",
            provider="ISRO / NRSC",
            detail="Stereo-derived DSM coverage must be checked for the exact AOI.",
            url=CARTODSM_URL,
            resolution_m=2.5,
            coverage=None,
        ),
        SourceRecord(
            id="india:bhoonidhi",
            name="Bhoonidhi satellite archive",
            role="optical_input",
            status="request_required",
            access="registered_or_ordered",
            provider="ISRO / NRSC",
            detail="Useful Indian satellite and Cartosat archive; it is not automatically LiDAR ground truth.",
            url=BHOONIDHI_URL,
            coverage=None,
        ),
        SourceRecord(
            id="india:naksha",
            name="NAKSHA urban mapping projects",
            role="validation_reference",
            status="request_required",
            access="project_or_authority_request",
            provider="Survey of India / DILRMP",
            detail="Some urban mapping projects include LiDAR, DSM, DTM and 3D products.",
            url=NAKSHA_URL,
            coverage=None,
        ),
    ]


def _coarse_ground_sources(repo_root: Path) -> list[SourceRecord]:
    local: list[SourceRecord] = []
    seen: set[Path] = set()
    for root in (repo_root / "data",):
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in {".tif", ".tiff"}:
                continue
            name = path.name.lower()
            if not any(token in name for token in ("nasadem", "srtm", "cartodem", "copernicus", "ground")):
                continue
            resolved = path.resolve()
            if resolved in seen:
                continue
            seen.add(resolved)
            local.append(
                SourceRecord(
                    id=f"local-ground:{path.relative_to(repo_root).as_posix()}",
                    name=f"Local coarse ground: {path.name}",
                    role="coarse_ground",
                    status="available",
                    access="local_file",
                    provider="HeightNet workspace",
                    detail="Existing raster can be used as the coarse ground baseline after alignment.",
                    path=path.relative_to(repo_root).as_posix(),
                    coverage=None,
                )
            )
    local.extend(
        [
            SourceRecord(
                id="global:nasadem",
                name="NASADEM via Planetary Computer",
                role="coarse_ground",
                status="downloadable",
                access="stac",
                provider="Microsoft Planetary Computer",
                detail="Automatic coarse ground fallback for georeferenced input.",
                url="https://planetarycomputer.microsoft.com/api/stac/v1",
                resolution_m=30.0,
                coverage=True,
            ),
            SourceRecord(
                id="global:cartodem",
                name="NRSC CartoDEM",
                role="coarse_ground",
                status="request_required",
                access="registered_or_ordered",
                provider="ISRO / NRSC",
                detail="Indian DEM option when coverage and access are confirmed.",
                url=CARTODEM_URL,
                coverage=None,
            ),
        ]
    )
    return local


def discover_sources(
    repo_root: str | Path,
    bbox: Sequence[float],
    *,
    include_remote_catalog: bool = True,
) -> dict[str, Any]:
    """Return source availability for one AOI without downloading data."""

    validated = validate_bbox(bbox)
    root = Path(repo_root).resolve()
    references = _local_sources(root, validated)
    if include_remote_catalog and os.getenv("HEIGHTNET_SKIP_REMOTE_CATALOG", "0") != "1":
        references.extend(_opentopography_matches(validated))
    references.extend(_official_india_sources())
    references.append(
        SourceRecord(
            id="manual:gcp-upload",
            name="Surveyed GCP CSV",
            role="calibration_reference",
            status="manual_upload",
            access="upload",
            provider="User supplied",
            detail="Upload a CSV with x,y,reference_m in the prediction raster CRS.",
            coverage=None,
        )
    )

    # Keep the response useful even when a remote catalog is unavailable.
    available_reference_count = sum(
        source.status == "available" for source in references
        if source.role in {"validation_reference", "calibration_reference"}
    )
    return {
        "bbox": list(validated),
        "sources": [source.as_dict() for source in references + _coarse_ground_sources(root)],
        "summary": {
            "reference_available": available_reference_count > 0,
            "reference_count": available_reference_count,
            "independent_validation_possible": available_reference_count > 0,
            "gcp_upload_supported": True,
            "coarse_ground_fallback": True,
        },
        "rules": {
            "reference_not_used_as_prediction_input_by_default": True,
            "coarse_dem_is_not_lidar_truth": True,
            "no_reference_means_metrics_are_not_reported": True,
        },
    }
