"""
Phase 3: set stroke-width on weight × size SVGs per SF Symbol path-weight table.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional, Tuple
from xml.etree import ElementTree as ET

from svg_to_sfsymbol.phase1 import element_to_bytes, parse_svg_file
from svg_to_sfsymbol.phase2 import PHASE2_WEIGHTS

# Reference: SF Symbol path weights (user-provided design grid).
# Keys are (weight name, size suffix L|M|S) matching filenames like ``Regular-M.svg``.
STROKE_WIDTH_BY_WEIGHT_SUFFIX: dict[tuple[str, str], float] = {
    # Large
    ("Ultralight", "L"): 2.5,
    ("Thin", "L"): 4.25,
    ("Light", "L"): 7.0,
    ("Regular", "L"): 9.125,
    ("Medium", "L"): 11.0,
    ("Semibold", "L"): 13.0,
    ("Bold", "L"): 14.75,
    ("Heavy", "L"): 17.75,
    ("Black", "L"): 21.0,
    # Medium
    ("Ultralight", "M"): 2.4,
    ("Thin", "M"): 4.0,
    ("Light", "M"): 6.5,
    ("Regular", "M"): 8.0,
    ("Medium", "M"): 10.125,
    ("Semibold", "M"): 11.5,
    ("Bold", "M"): 13.25,
    ("Heavy", "M"): 16.0,
    ("Black", "M"): 18.0,
    # Small
    ("Ultralight", "S"): 2.25,
    ("Thin", "S"): 3.5,
    ("Light", "S"): 6.0,
    ("Regular", "S"): 7.5,
    ("Medium", "S"): 8.75,
    ("Semibold", "S"): 9.5,
    ("Bold", "S"): 11.0,
    ("Heavy", "S"): 12.5,
    ("Black", "S"): 14.25,
}

_STROKEABLE_TAGS = frozenset(
    {
        "path",
        "line",
        "polyline",
        "polygon",
        "circle",
        "ellipse",
        "rect",
    }
)

_WEIGHT_STEMS = frozenset(PHASE2_WEIGHTS)


def _local_tag(tag: str) -> str:
    if tag.startswith("{"):
        return tag.split("}", 1)[1]
    return tag


def parse_weight_stem(stem: str) -> Optional[Tuple[str, str]]:
    """``Black-L`` -> (\"Black\", \"L\"); unknown pattern -> None."""
    if "-" not in stem:
        return None
    weight, suffix = stem.rsplit("-", 1)
    if suffix not in ("L", "M", "S"):
        return None
    if weight not in _WEIGHT_STEMS:
        return None
    return weight, suffix


def _parse_style(style: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for part in style.split(";"):
        part = part.strip()
        if not part or ":" not in part:
            continue
        k, v = part.split(":", 1)
        key = k.strip().lower()
        out[key] = v.strip()
    return out


def _format_style(props: dict[str, str]) -> str:
    return ";".join(f"{k}:{v}" for k, v in props.items())


def _stroke_color_present(props: dict[str, str]) -> bool:
    s = props.get("stroke", "").strip().lower()
    return bool(s) and s not in ("none", "transparent")


def _element_is_stroked(el: ET.Element) -> bool:
    if _local_tag(el.tag) not in _STROKEABLE_TAGS:
        return False
    stroke_attr = el.get("stroke")
    if stroke_attr is not None:
        sa = stroke_attr.strip().lower()
        if sa and sa not in ("none", "transparent"):
            return True
    style = el.get("style")
    if style:
        sd = _parse_style(style)
        if _stroke_color_present(sd):
            return True
        for k in ("stroke-linecap", "stroke-linejoin", "stroke-dasharray"):
            if sd.get(k):
                return True
    return False


def _format_stroke_width(value: float) -> str:
    if value == int(value):
        return str(int(value))
    return str(value)


def _apply_stroke_width(el: ET.Element, width: float) -> None:
    wstr = _format_stroke_width(width)
    style = el.get("style")
    if style:
        sd = _parse_style(style)
        sd["stroke-width"] = wstr
        el.set("style", _format_style(sd))
        el.attrib.pop("stroke-width", None)
    else:
        el.set("stroke-width", wstr)


def apply_stroke_widths_to_tree(root: ET.Element, width: float) -> int:
    """Set stroke-width on all stroked vector elements; return count updated."""
    n = 0
    for el in root.iter():
        if _element_is_stroked(el):
            _apply_stroke_width(el, width)
            n += 1
    return n


def process_weight_svg(path: Path, stroke_width: float) -> int:
    """Load SVG, apply stroke width, write back. Returns number of elements updated."""
    svg_root = parse_svg_file(path)
    count = apply_stroke_widths_to_tree(svg_root, stroke_width)
    path.write_bytes(element_to_bytes(svg_root))
    return count


def run_phase3(output_dir: Path) -> dict[str, int]:
    """
    For each ``{Weight}-{L|M|S}.svg`` in *output_dir*, set stroke-width from
    :data:`STROKE_WIDTH_BY_WEIGHT_SUFFIX`. Skips ``original.svg`` and other names.

    Returns map stem -> number of elements updated.
    """
    output_dir = output_dir.resolve()
    results: dict[str, int] = {}

    for path in sorted(output_dir.glob("*.svg")):
        if path.name == "original.svg":
            continue
        parsed = parse_weight_stem(path.stem)
        if parsed is None:
            continue
        weight, suffix = parsed
        key = (weight, suffix)
        if key not in STROKE_WIDTH_BY_WEIGHT_SUFFIX:
            continue
        sw = STROKE_WIDTH_BY_WEIGHT_SUFFIX[key]
        n = process_weight_svg(path, sw)
        results[path.stem] = n

    return results


def assert_stroke_table_complete() -> None:
    """Invariant: table covers every phase-2 weight × L/M/S."""
    for w in PHASE2_WEIGHTS:
        for s in ("L", "M", "S"):
            assert (w, s) in STROKE_WIDTH_BY_WEIGHT_SUFFIX, (w, s)


assert_stroke_table_complete()
