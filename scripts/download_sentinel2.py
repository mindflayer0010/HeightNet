"""Download RGB bands from a Planetary Computer Sentinel-2 STAC item."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.data.sentinel2 import download_sentinel2_rgb


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--item-url",
        required=True,
        help="STAC item URL or local STAC item JSON path.",
    )
    parser.add_argument("--output", required=True, help="Output RGB GeoTIFF path.")
    parser.add_argument(
        "--bbox",
        nargs=4,
        type=float,
        metavar=("MIN_LON", "MIN_LAT", "MAX_LON", "MAX_LAT"),
        help="Optional WGS84 crop bounds.",
    )
    args = parser.parse_args()
    output = download_sentinel2_rgb(
        args.item_url,
        args.output,
        bbox_wgs84=args.bbox,
    )
    print("RGB GeoTIFF:", output)


if __name__ == "__main__":
    main()
