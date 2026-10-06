"""Create a small, readable summary from one or more evaluation JSON files."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any


METRIC_ALIASES = {
    "mae": ("mae", "mae_m"),
    "rmse": ("rmse", "rmse_m"),
    "correlation": ("correlation", "pearson", "r"),
    "bias": ("bias", "bias_m"),
    "sample_count": ("sample_count", "count", "n"),
    "r2": ("r2", "r_squared"),
}


def _number(value: Any) -> str:
    if value is None:
        return "Not available"
    if isinstance(value, bool):
        return str(value)
    try:
        return f"{float(value):.4f}"
    except (TypeError, ValueError):
        return str(value)


def _metric_rows(value: Any, path: str = "root") -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    if isinstance(value, dict):
        lowered = {str(key).lower(): item for key, item in value.items()}
        found: dict[str, Any] = {}
        for name, aliases in METRIC_ALIASES.items():
            for alias in aliases:
                if alias in lowered:
                    found[name] = lowered[alias]
                    break
        if len(found) >= 2:
            rows.append(
                {
                    "scope": path,
                    "sample_count": _number(found.get("sample_count")),
                    "mae": _number(found.get("mae")),
                    "rmse": _number(found.get("rmse")),
                    "correlation": _number(found.get("correlation")),
                    "bias": _number(found.get("bias")),
                    "r2": _number(found.get("r2")),
                }
            )
        for key, child in value.items():
            rows.extend(_metric_rows(child, f"{path}.{key}"))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            rows.extend(_metric_rows(child, f"{path}[{index}]"))
    return rows


def _markdown(rows: list[dict[str, str]]) -> str:
    lines = [
        "# Evaluation summary",
        "",
        f"Generated: {datetime.now(timezone.utc).isoformat()}",
        "",
        "Numbers come from existing JSON reports. Missing values are not treated as zero.",
        "",
        "| Report | Scope | Samples | MAE (m) | RMSE (m) | Correlation | Bias (m) | R2 |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for row in rows:
        lines.append(
            "| {report} | {scope} | {sample_count} | {mae} | {rmse} | {correlation} | {bias} | {r2} |".format(
                **row
            )
        )
    if not rows:
        lines.append("| No metric objects found | - | - | - | - | - | - | - |")
    lines.extend(
        [
            "",
            "## Meaning of the numbers",
            "",
            "- MAE is the average absolute height error.",
            "- RMSE gives more weight to large errors.",
            "- Correlation shows whether predicted and reference heights change together.",
            "- Bias shows whether the prediction is generally too high or too low.",
            "- These results do not replace independent LiDAR or GCP validation for a new location.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", nargs="+", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    rows: list[dict[str, str]] = []
    for path in args.input:
        with path.open(encoding="utf-8") as source:
            document = json.load(source)
        for row in _metric_rows(document):
            row["report"] = path.name
            rows.append(row)
    result = _markdown(rows)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(result, encoding="utf-8")
    else:
        print(result)


if __name__ == "__main__":
    main()
