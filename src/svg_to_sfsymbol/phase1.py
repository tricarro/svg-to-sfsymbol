"""
Phase 1: produce square size variants (Large / Medium / Small) from an SVG,
centering the source viewBox uniformly in each output and scaling paths with it.
"""

from __future__ import annotations

import copy
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO
from xml.etree import ElementTree as ET

from defusedxml.ElementTree import parse as defused_parse

from svg_to_sfsymbol.svg_affine_bake import bake_visual_subtree, build_phase1_bake_matrix

SVG_NS = "http://www.w3.org/2000/svg"


def _local_tag(tag: str) -> str:
    if tag.startswith("{"):
        return tag.split("}", 1)[1]
    return tag


_FLOAT_RE = re.compile(r"^[-+]?(?:\d*\.?\d+(?:[eE][-+]?\d+)?)$")


def _parse_length(value: str | None) -> float | None:
    if value is None:
        return None
    v = value.strip()
    for suffix in ("px", "pt", "pc", "mm", "cm", "in"):
        if v.lower().endswith(suffix):
            v = v[: -len(suffix)].strip()
            break
    if not v or v.endswith("%"):
        return None
    if not _FLOAT_RE.match(v):
        return None
    return float(v)


def _parse_view_box(raw: str | None) -> tuple[float, float, float, float] | None:
    if not raw:
        return None
    parts = re.split(r"[,\s]+", raw.strip())
    nums: list[float] = []
    for p in parts:
        if not p:
            continue
        try:
            nums.append(float(p))
        except ValueError:
            return None
    if len(nums) != 4:
        return None
    x, y, w, h = nums
    if w <= 0 or h <= 0:
        return None
    return (x, y, w, h)


@dataclass(frozen=True)
class SizeVariant:
    name: str
    side_px: int


PHASE1_VARIANTS: tuple[SizeVariant, ...] = (
    SizeVariant("large", 164),
    SizeVariant("medium", 136),
    SizeVariant("small", 112),
)


def read_view_box(svg_root: ET.Element) -> tuple[float, float, float, float]:
    """Resolve (min_x, min_y, width, height) from viewBox or width/height."""
    vb = _parse_view_box(svg_root.get("viewBox"))
    if vb is not None:
        return vb

    w = _parse_length(svg_root.get("width"))
    h = _parse_length(svg_root.get("height"))
    if w is not None and h is not None and w > 0 and h > 0:
        return (0.0, 0.0, float(w), float(h))

    raise ValueError(
        "SVG root must have a valid viewBox or numeric width and height (px or unitless)."
    )


def _partition_visual_children(
    svg_root: ET.Element,
) -> tuple[list[ET.Element], list[ET.Element]]:
    defs_nodes: list[ET.Element] = []
    other: list[ET.Element] = []
    for child in list(svg_root):
        if _local_tag(child.tag) == "defs":
            defs_nodes.append(child)
        else:
            other.append(child)
    return defs_nodes, other


def build_variant_svg(
    svg_root: ET.Element,
    side_px: int,
) -> ET.Element:
    """
    Return a new svg root: viewBox 0 0 side_px side_px, width/height side_px,
    defs preserved. Geometry is uniformly scaled and centered by baking coordinates
    into paths/shapes (no ``scale()`` transform group), so stroke-width is not
    scaled by a parent transform.
    """
    ox, oy, ow, oh = read_view_box(svg_root)
    root = copy.deepcopy(svg_root)

    defs_nodes, other = _partition_visual_children(root)
    for _ in list(root):
        root.remove(_)

    for d in defs_nodes:
        root.append(d)

    s = min(side_px / ow, side_px / oh)
    tx = (side_px - ow * s) / 2
    ty = (side_px - oh * s) / 2
    m = build_phase1_bake_matrix(s, ox, oy, tx, ty)
    for node in other:
        bake_visual_subtree(node, m)
        root.append(node)

    root.set("viewBox", f"0 0 {side_px} {side_px}")
    root.set("width", str(side_px))
    root.set("height", str(side_px))

    return root


def _register_svg_namespace() -> None:
    ET.register_namespace("", SVG_NS)


def element_to_bytes(root: ET.Element) -> bytes:
    _register_svg_namespace()
    tree = ET.ElementTree(root)
    # Avoid default_namespace: ElementTree rejects unprefixed attributes (e.g. id) with it on py3.9.
    return ET.tostring(
        tree.getroot(),
        encoding="utf-8",
        xml_declaration=True,
    )


def parse_svg_file(path: Path) -> ET.Element:
    tree = defused_parse(str(path))
    r = tree.getroot()
    if _local_tag(r.tag) != "svg":
        raise ValueError("Root element must be svg")
    return r


def parse_svg_stream(stream: BinaryIO) -> ET.Element:
    tree = defused_parse(stream)
    r = tree.getroot()
    if _local_tag(r.tag) != "svg":
        raise ValueError("Root element must be svg")
    return r


def run_phase1(
    input_path: Path,
    output_dir: Path,
    *,
    original_name: str = "original.svg",
) -> dict[str, Path]:
    """
    Copy the original SVG and write large/medium/small variants into output_dir.

    Returns a map: variant key -> written path (includes 'original').
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    original_out = output_dir / original_name
    shutil.copy2(input_path, original_out)

    svg_root = parse_svg_file(input_path)
    written: dict[str, Path] = {"original": original_out}

    for v in PHASE1_VARIANTS:
        variant_root = build_variant_svg(svg_root, v.side_px)
        out_path = output_dir / f"{v.name}.svg"
        out_path.write_bytes(element_to_bytes(variant_root))
        written[v.name] = out_path

    return written
