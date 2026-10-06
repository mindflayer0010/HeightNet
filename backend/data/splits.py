"""Reproducible scene-level dataset splits."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import random
from typing import Iterable


class SplitError(ValueError):
    """Raised when a scene split cannot be created or loaded."""


@dataclass(frozen=True)
class SceneSplit:
    """Disjoint scene IDs for model development and final evaluation."""

    train: tuple[str, ...]
    validation: tuple[str, ...]
    test: tuple[str, ...]

    @property
    def val(self) -> tuple[str, ...]:
        return self.validation


def split_scene_ids(
    scene_ids: Iterable[str],
    *,
    seed: int = 42,
    validation_fraction: float = 0.15,
    test_fraction: float = 0.15,
) -> SceneSplit:
    """Create a deterministic, disjoint scene-level split."""

    unique_ids = sorted(set(scene_ids))
    if len(unique_ids) < 3:
        raise SplitError("At least three scenes are required for train/val/test.")
    if not 0 < validation_fraction < 1 or not 0 < test_fraction < 1:
        raise SplitError("Validation and test fractions must be between 0 and 1.")
    if validation_fraction + test_fraction >= 1:
        raise SplitError("Validation and test fractions must leave training scenes.")

    shuffled = list(unique_ids)
    random.Random(seed).shuffle(shuffled)
    validation_count = max(1, round(len(shuffled) * validation_fraction))
    test_count = max(1, round(len(shuffled) * test_fraction))
    train_count = len(shuffled) - validation_count - test_count
    if train_count < 1:
        raise SplitError("Split fractions leave no training scenes.")

    return SceneSplit(
        train=tuple(sorted(shuffled[:train_count])),
        validation=tuple(sorted(shuffled[train_count : train_count + validation_count])),
        test=tuple(sorted(shuffled[train_count + validation_count :])),
    )


def write_scene_split(path: str | Path, split: SceneSplit, *, seed: int) -> Path:
    """Write a human-readable split manifest."""

    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(
            {
                "seed": seed,
                "train": list(split.train),
                "validation": list(split.validation),
                "test": list(split.test),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return destination


def load_scene_split(path: str | Path) -> SceneSplit:
    """Load and validate a scene split manifest."""

    with Path(path).open(encoding="utf-8") as source:
        payload = json.load(source)
    try:
        split = SceneSplit(
            train=tuple(payload["train"]),
            validation=tuple(payload["validation"]),
            test=tuple(payload["test"]),
        )
    except (KeyError, TypeError) as exc:
        raise SplitError("Split manifest must contain train, validation, and test lists.") from exc

    groups = (set(split.train), set(split.validation), set(split.test))
    if any(not group for group in groups) or any(
        groups[first] & groups[second]
        for first in range(3)
        for second in range(first + 1, 3)
    ):
        raise SplitError("Scene split groups must be non-empty and disjoint.")
    return split
