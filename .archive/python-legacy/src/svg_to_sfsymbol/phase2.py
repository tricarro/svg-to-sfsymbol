"""
Phase 2: duplicate each phase-1 size SVG into SF Symbol weight slots and remove
large.svg / medium.svg / small.svg.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from svg_to_sfsymbol.phase1 import PHASE1_VARIANTS

# Order matches SF Symbols template / design grid (e.g. square_template.svg).
PHASE2_WEIGHTS: tuple[str, ...] = (
    "Black",
    "Heavy",
    "Bold",
    "Semibold",
    "Medium",
    "Regular",
    "Light",
    "Thin",
    "Ultralight",
)

# Phase 1 writes large.svg / medium.svg / small.svg; filenames use -L / -M / -S.
PHASE2_SIZE_SUFFIX: tuple[tuple[str, str], ...] = tuple(
    (v.name, {"large": "L", "medium": "M", "small": "S"}[v.name])
    for v in PHASE1_VARIANTS
)


def run_phase2(output_dir: Path) -> dict[str, Path]:
    """
    For each of large/medium/small.svg, copy to nine weight-named files, then
    delete the size file.

    Produces names like ``Black-L.svg``, ``Regular-M.svg``, ``Ultralight-S.svg``.

    Returns a map of stem keys (e.g. ``Black-L``) to written paths.
    """
    output_dir = output_dir.resolve()
    written: dict[str, Path] = {}

    for size_key, suffix in PHASE2_SIZE_SUFFIX:
        src = output_dir / f"{size_key}.svg"
        if not src.is_file():
            raise FileNotFoundError(
                f"Phase 2 expects {src.name} in {output_dir}; run phase 1 first or "
                "use the combined convert command."
            )
        for weight in PHASE2_WEIGHTS:
            stem = f"{weight}-{suffix}"
            dest = output_dir / f"{stem}.svg"
            shutil.copy2(src, dest)
            written[stem] = dest
        src.unlink()

    return written
