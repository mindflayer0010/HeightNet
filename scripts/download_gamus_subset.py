"""Batch-download complete GAMUS scene triplets from Hugging Face."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from huggingface_hub import HfApi, hf_hub_download


REPOSITORY = "earthflow/GAMUS"
REMOTE_PREFIXES = {
    "rgb": ("images", "_RGB.h5"),
    "height": ("heights", "_AGL.h5"),
    "semantic": ("classes", "_CLS.h5"),
}


def remote_scene_ids(files: list[str], split: str) -> list[str]:
    """Return scene IDs that have all three required remote files."""

    by_scene: dict[str, set[str]] = {}
    for kind, (directory, suffix) in REMOTE_PREFIXES.items():
        prefix = f"{directory}/{split}/"
        for path in files:
            if not path.startswith(prefix) or not path.endswith(suffix):
                continue
            filename = Path(path).name
            scene_id = filename[: -len(suffix)]
            by_scene.setdefault(scene_id, set()).add(kind)
    required = set(REMOTE_PREFIXES)
    return sorted(scene for scene, kinds in by_scene.items() if kinds == required)


def complete_local_scene_ids(root: Path, split: str) -> set[str]:
    """Find local scene IDs whose RGB, AGL, and class files all exist."""

    local_ids: set[str] = set()
    rgb_dir = root / "images" / split
    if not rgb_dir.is_dir():
        return local_ids
    for rgb_path in rgb_dir.glob("*_RGB.h5"):
        scene_id = rgb_path.name.removesuffix("_RGB.h5")
        if all(
            (root / directory / split / f"{scene_id}{suffix}").is_file()
            for directory, suffix in (
                ("heights", "_AGL.h5"),
                ("classes", "_CLS.h5"),
            )
        ):
            local_ids.add(scene_id)
    return local_ids


def download_scenes(
    *,
    output_root: str | Path,
    split: str,
    count: int,
    workers: int = 8,
) -> list[str]:
    """Download ``count`` additional complete scenes and return their IDs."""

    if count < 1:
        raise ValueError("count must be positive.")
    if workers < 1:
        raise ValueError("workers must be positive.")
    root = Path(output_root)
    api = HfApi()
    files = list(api.list_repo_files(REPOSITORY, repo_type="dataset"))
    available = remote_scene_ids(files, split)
    existing = complete_local_scene_ids(root, split)
    selected = [scene for scene in available if scene not in existing][:count]
    if len(selected) < count:
        raise RuntimeError(
            f"Only {len(selected)} new complete scenes are available for split '{split}'."
        )

    requests = [
        (scene_id, directory, suffix)
        for scene_id in selected
        for directory, suffix in (
            ("images", "_RGB.h5"),
            ("heights", "_AGL.h5"),
            ("classes", "_CLS.h5"),
        )
    ]

    def download_one(request: tuple[str, str, str]) -> str:
        scene_id, directory, suffix = request
        hf_hub_download(
            repo_id=REPOSITORY,
            repo_type="dataset",
            filename=f"{directory}/{split}/{scene_id}{suffix}",
            local_dir=root,
        )
        return scene_id

    completed: set[str] = set()
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(download_one, request) for request in requests]
        for future in as_completed(futures):
            completed.add(future.result())
            if len(completed) % 25 == 0:
                print(f"Completed files for {len(completed)} scenes...", flush=True)
    return selected


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=10, help="Additional scenes to download.")
    parser.add_argument("--split", default="train", choices=("train", "val", "test"))
    parser.add_argument("--output-root", default="data/gamus_raw")
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()
    selected = download_scenes(
        output_root=args.output_root,
        split=args.split,
        count=args.count,
        workers=args.workers,
    )
    print(f"Downloaded {len(selected)} scenes: {', '.join(selected)}")


if __name__ == "__main__":
    main()
