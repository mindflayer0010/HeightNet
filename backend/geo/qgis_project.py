"""Small helpers for opening a HeightNet result in QGIS.

The portal runs locally, so it can create a normal QGIS project file and ask
the desktop QGIS application to open it.  The browser alone cannot launch a
desktop program, which is why this lives in the local Python server.
"""

from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
from typing import Any
import uuid
import xml.etree.ElementTree as ET


def _safe_layer_id(label: str, index: int) -> str:
    slug = "".join(char.lower() if char.isalnum() else "-" for char in label).strip("-")
    return f"heightnet-{slug or 'layer'}-{index}"


def _add_raster_renderer(maplayer: ET.Element, label: str) -> None:
    """Add a conservative renderer that QGIS can refine from raster stats."""

    renderer = ET.SubElement(maplayer, "rasterrenderer")
    if label.lower().startswith("rgb") or "texture" in label.lower():
        renderer.set("type", "multibandcolor")
        renderer.set("opacity", "1")
        renderer.set("redBand", "1")
        renderer.set("greenBand", "2")
        renderer.set("blueBand", "3")
        renderer.set("alphaBand", "-1")
    else:
        renderer.set("type", "singlebandgray")
        renderer.set("opacity", "1")
        renderer.set("band", "1")
        renderer.set("alphaBand", "-1")


def create_qgis_project(project_path: Path, layers: list[dict[str, Any]]) -> None:
    """Write a portable QGIS project containing the supplied raster layers."""

    root = ET.Element(
        "qgis",
        {
            "projectname": "HeightNet analysis",
            "version": "3.34.0",
            "saveUser": "true",
        },
    )
    project_layers = ET.SubElement(root, "projectlayers")
    layer_tree = ET.SubElement(root, "layer-tree-group", {"name": "HeightNet", "checked": "Qt::Checked", "expanded": "1"})
    layer_order = ET.SubElement(root, "layerorder")

    first_bounds: tuple[float, float, float, float] | None = None
    first_crs: str | None = None
    for index, item in enumerate(layers):
        path = Path(str(item["path"])).resolve()
        label = str(item.get("label") or path.stem)
        layer_id = _safe_layer_id(label, index)
        visible = "Qt::Checked" if item.get("visible", True) else "Qt::Unchecked"
        opacity = max(0.0, min(1.0, float(item.get("opacity", 1.0))))

        maplayer = ET.SubElement(
            project_layers,
            "maplayer",
            {
                "type": "raster",
                "name": label,
                "id": layer_id,
                "styleCategories": "AllStyleCategories",
            },
        )
        ET.SubElement(maplayer, "datasource").text = path.as_posix()
        ET.SubElement(maplayer, "layername").text = label
        ET.SubElement(maplayer, "provider").text = "gdal"
        ET.SubElement(maplayer, "layerOpacity").text = f"{opacity:.4f}"
        ET.SubElement(maplayer, "blendMode").text = "0"
        ET.SubElement(maplayer, "customproperties")
        _add_raster_renderer(maplayer, label)
        ET.SubElement(layer_tree, "layer-tree-layer", {"id": layer_id, "name": label, "checked": visible, "expanded": "1"})
        ET.SubElement(layer_order, "layer-id").text = layer_id

        if first_bounds is None:
            try:
                import rasterio

                with rasterio.open(path) as dataset:
                    bounds = dataset.bounds
                    first_bounds = (bounds.left, bounds.right, bounds.bottom, bounds.top)
                    first_crs = dataset.crs.to_string() if dataset.crs else None
            except Exception:
                first_bounds = None

    if first_bounds:
        xmin, xmax, ymin, ymax = first_bounds
        mapcanvas = ET.SubElement(root, "mapcanvas", {"name": "HeightNet map"})
        extent = ET.SubElement(mapcanvas, "extent")
        for tag, value in (("xmin", xmin), ("ymin", ymin), ("xmax", xmax), ("ymax", ymax)):
            ET.SubElement(extent, tag).text = str(value)
        ET.SubElement(mapcanvas, "rotation").text = "0"
        ET.SubElement(mapcanvas, "units").text = "meters"
        destination = ET.SubElement(mapcanvas, "destinationsrs")
        spatial_ref = ET.SubElement(destination, "spatialrefsys")
        if first_crs:
            ET.SubElement(spatial_ref, "authid").text = first_crs

    ET.SubElement(root, "properties")
    ET.SubElement(root, "visibility-presets")
    project_path.parent.mkdir(parents=True, exist_ok=True)
    tree = ET.ElementTree(root)
    ET.indent(tree, space="  ")
    tree.write(project_path, encoding="utf-8", xml_declaration=True)


def find_qgis() -> str | None:
    """Find a local QGIS executable without requiring QGIS in PATH."""

    configured = os.environ.get("QGIS_BIN")
    if configured and Path(configured).is_file():
        return configured

    for name in ("qgis", "qgis-ltr", "qgis-bin.exe", "qgis-ltr-bin.exe"):
        found = shutil.which(name)
        if found:
            return found

    roots = [Path("C:/Program Files"), Path("C:/Program Files (x86)")]
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        roots.extend([Path(local_app_data), Path(local_app_data) / "Programs"])
    for root in roots:
        if not root.is_dir():
            continue
        for pattern in ("QGIS*/bin/qgis.exe", "QGIS*/bin/qgis-bin.exe", "QGIS*/bin/qgis-ltr-bin.exe"):
            matches = sorted(root.glob(pattern), reverse=True)
            if matches:
                return str(matches[0])
    return None


def open_qgis_project(project_path: Path) -> tuple[bool, str]:
    executable = find_qgis()
    if not executable:
        return False, "QGIS project created. QGIS was not found; open the .qgs file manually."
    try:
        subprocess.Popen([executable, str(project_path)], cwd=str(project_path.parent))
    except OSError as exc:
        return False, f"QGIS project created, but QGIS could not be launched: {exc}"
    return True, "QGIS opened with the HeightNet layers loaded."


def prepare_qgis_project(job_root: Path, layers: list[dict[str, Any]]) -> tuple[Path, str]:
    project_dir = job_root / "qgis_projects" / f"heightnet-{uuid.uuid4().hex[:10]}"
    project_path = project_dir / "heightnet_analysis.qgs"
    create_qgis_project(project_path, layers)
    return project_path, str(project_path)
