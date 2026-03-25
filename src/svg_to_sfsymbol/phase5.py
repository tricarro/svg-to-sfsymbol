"""
Phase 5: merge generated weight×size SVGs into Apple's SF Symbol square template.

For each ``<g id="Black-L">`` … under ``<g id="Symbols">``, replace the
``SFSymbolsPreviewWireframe`` path with the corresponding ``{id}.svg`` content,
uniformly scaled and centered to the wireframe path's bounding box in local
coordinates, then remove the wireframe.
"""

from __future__ import annotations

import copy
import warnings
from pathlib import Path
from typing import Literal, Optional, Tuple
from xml.etree import ElementTree as ET

from svg.path import parse_path

from svg_to_sfsymbol.phase1 import element_to_bytes, parse_svg_file, read_view_box
from svg_to_sfsymbol.phase2 import PHASE2_SIZE_SUFFIX, PHASE2_WEIGHTS
from svg_to_sfsymbol.phase3 import _local_tag, parse_weight_stem

SVG_NS = "http://www.w3.org/2000/svg"
_G_TAG = f"{{{SVG_NS}}}g"
_PATH_TAG = f"{{{SVG_NS}}}path"
_DEFS_TAG = f"{{{SVG_NS}}}defs"
WIREFRAME_CLASS = "SFSymbolsPreviewWireframe"

MissingPolicy = Literal["skip", "warn", "fail"]


def default_square_template_path() -> Optional[Path]:
    """
    Return ``resources/square_template.svg`` next to the project root that contains
    ``src/svg_to_sfsymbol``, if that file exists.

    Used by ``convert`` to run phase 5 without extra flags. Returns ``None`` when
    the file is absent (e.g. a minimal install without bundled resources).
    """
    here = Path(__file__).resolve().parent
    candidate = here.parent.parent / "resources" / "square_template.svg"
    return candidate if candidate.is_file() else None


def _expected_slot_ids() -> frozenset[str]:
    return frozenset(
        f"{w}-{suf}"
        for w in PHASE2_WEIGHTS
        for _name, suf in PHASE2_SIZE_SUFFIX
    )


def _find_symbols_group(root: ET.Element) -> ET.Element:
    for el in root.iter():
        if _local_tag(el.tag) == "g" and el.get("id") == "Symbols":
            return el
    raise ValueError('No <g id="Symbols"> found in template.')


def _ensure_template_defs(svg_root: ET.Element) -> ET.Element:
    for child in svg_root:
        if _local_tag(child.tag) == "defs":
            return child
    defs = ET.Element(_DEFS_TAG)
    svg_root.insert(0, defs)
    return defs


def _wireframe_bbox(d: str) -> Tuple[float, float, float, float]:
    """Axis-aligned bbox (minx, miny, width, height) of path ``d``."""
    path = parse_path(d)
    x_min, y_min, x_max, y_max = path.boundingbox()
    bw = x_max - x_min
    bh = y_max - y_min
    if bw <= 0 or bh <= 0:
        raise ValueError(f"Degenerate wireframe bbox from path d={d[:80]!r}…")
    return (x_min, y_min, bw, bh)


def _partition_icon_children(
    icon_root: ET.Element,
) -> tuple[list[ET.Element], list[ET.Element]]:
    defs_nodes: list[ET.Element] = []
    other: list[ET.Element] = []
    for child in list(icon_root):
        if _local_tag(child.tag) == "defs":
            defs_nodes.append(child)
        else:
            other.append(child)
    return defs_nodes, other


def _class_has_wireframe(class_attr: Optional[str]) -> bool:
    if not class_attr:
        return False
    return WIREFRAME_CLASS in class_attr.split()


def _merge_icon_defs_into(
    template_defs: ET.Element, defs_elements: list[ET.Element]
) -> None:
    existing_ids = {
        el.get("id")
        for el in template_defs.iter()
        if el.get("id") is not None
    }
    for defs_el in defs_elements:
        for child in list(defs_el):
            cid = child.get("id")
            if cid is not None and cid in existing_ids:
                continue
            template_defs.append(copy.deepcopy(child))
            if cid is not None:
                existing_ids.add(cid)


def _fill_slot(
    slot: ET.Element,
    icon_path: Path,
    template_defs: ET.Element,
) -> None:
    wire: Optional[ET.Element] = None
    for child in list(slot):
        if _local_tag(child.tag) != "path":
            continue
        if _class_has_wireframe(child.get("class")):
            wire = child
            break
    if wire is None:
        raise ValueError(
            f'Slot <g id="{slot.get("id")}"> has no {WIREFRAME_CLASS!r} path.'
        )

    d = wire.get("d")
    if not d:
        raise ValueError(f'Wireframe path in slot {slot.get("id")!r} has no d.')

    bx, by, bw, bh = _wireframe_bbox(d)

    icon_root = parse_svg_file(icon_path)
    _ox, _oy, sw, sh = read_view_box(icon_root)
    if sw <= 0 or sh <= 0:
        raise ValueError(f"Invalid icon viewBox dimensions in {icon_path}")

    scale = min(bw / sw, bh / sh)
    tx = bx + (bw - scale * sw) / 2.0
    ty = by + (bh - scale * sh) / 2.0

    defs_nodes, visual = _partition_icon_children(icon_root)
    if defs_nodes:
        _merge_icon_defs_into(template_defs, defs_nodes)

    slot.remove(wire)

    wrap = ET.Element(_G_TAG)
    wrap.set("transform", f"translate({tx} {ty}) scale({scale})")
    for node in visual:
        wrap.append(copy.deepcopy(node))
    slot.append(wrap)


def run_phase5(
    template_path: Path,
    icons_dir: Path,
    output_path: Path,
    *,
    missing: MissingPolicy = "skip",
) -> dict[str, int | list[str]]:
    """
    Merge icons from ``icons_dir`` (files ``Black-L.svg``, …) into ``template_path``.

    ``missing``: ``skip`` leaves the wireframe; ``warn`` emits ``warnings.warn``;
    ``fail`` raises ``FileNotFoundError`` on the first missing icon for a template slot.

    Returns ``{"filled": n, "skipped": n, "missing_ids": [...]}``.
    """
    template_path = template_path.expanduser().resolve()
    icons_dir = icons_dir.expanduser().resolve()
    output_path = output_path.expanduser().resolve()

    if not template_path.is_file():
        raise FileNotFoundError(f"Template not found: {template_path}")
    if not icons_dir.is_dir():
        raise NotADirectoryError(f"Icons directory not found: {icons_dir}")

    root = parse_svg_file(template_path)
    symbols = _find_symbols_group(root)
    template_defs = _ensure_template_defs(root)
    expected = _expected_slot_ids()

    filled = 0
    skipped = 0
    missing_ids: list[str] = []

    for slot in list(symbols):
        if _local_tag(slot.tag) != "g":
            continue
        sid = slot.get("id")
        if not sid or sid not in expected:
            continue
        if parse_weight_stem(sid) is None:
            continue

        icon_file = icons_dir / f"{sid}.svg"
        if not icon_file.is_file():
            missing_ids.append(sid)
            if missing == "fail":
                raise FileNotFoundError(
                    f"Missing icon for template slot {sid!r}: {icon_file}"
                )
            if missing == "warn":
                warnings.warn(
                    f"Phase 5: missing icon for slot {sid!r} ({icon_file}), "
                    "leaving wireframe.",
                    stacklevel=2,
                )
            skipped += 1
            continue

        _fill_slot(slot, icon_file, template_defs)
        filled += 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(element_to_bytes(root))

    return {"filled": filled, "skipped": skipped, "missing_ids": missing_ids}
