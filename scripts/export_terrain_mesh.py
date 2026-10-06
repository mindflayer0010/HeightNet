"""Export a HeightNet RGB/DSM pair for a 3D renderer."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.visualization.mesh import export_obj_mesh


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rgb", required=True)
    parser.add_argument("--elevation", required=True)
    parser.add_argument("--output", required=True, help="Output OBJ path.")
    parser.add_argument("--stride", type=int, default=4)
    parser.add_argument("--vertical-exaggeration", type=float, default=1.0)
    args = parser.parse_args()
    result = export_obj_mesh(
        args.rgb,
        args.elevation,
        args.output,
        stride=args.stride,
        vertical_exaggeration=args.vertical_exaggeration,
    )
    print("OBJ:", result.obj_path)
    print("Material:", result.material_path)
    print("Texture:", result.texture_path)
    print("Metadata:", result.metadata_path)
    print("Vertices:", result.vertex_count, "Faces:", result.face_count)


if __name__ == "__main__":
    main()
