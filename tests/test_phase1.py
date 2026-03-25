"""Tests for Phase 1 viewBox scaling and outputs."""

from __future__ import annotations

import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest

from svg_to_sfsymbol.phase1 import (
    PHASE1_VARIANTS,
    build_variant_svg,
    parse_svg_file,
    read_view_box,
    run_phase1,
)


def _local_tag(tag: str) -> str:
    if tag.startswith("{"):
        return tag.split("}", 1)[1]
    return tag


def test_read_view_box_square() -> None:
    p = Path(__file__).resolve().parent.parent / "resources" / "calendar-today.svg"
    root = parse_svg_file(p)
    assert read_view_box(root) == (0.0, 0.0, 32.0, 32.0)


def test_variant_square_scales_uniformly() -> None:
    p = Path(__file__).resolve().parent.parent / "resources" / "calendar-today.svg"
    root = parse_svg_file(p)
    v = build_variant_svg(root, 120)
    assert v.get("viewBox") == "0 0 120 120"
    assert v.get("width") == "120"
    assert v.get("height") == "120"
    assert not any(_local_tag(c.tag) == "g" for c in v)
    paths = [c for c in v if _local_tag(c.tag) == "path"]
    assert paths
    d0 = paths[0].get("d", "")
    # 16*3.75=60, 12*3.75=45 for current resources/calendar-today.svg
    assert d0.lstrip().startswith("M 60,45") or d0.lstrip().startswith("M60,45")


def test_run_phase1_writes_four_files() -> None:
    p = Path(__file__).resolve().parent.parent / "resources" / "calendar-today.svg"
    with tempfile.TemporaryDirectory() as td:
        out = Path(td)
        paths = run_phase1(p, out)
        assert paths["original"].read_bytes() == p.read_bytes()
        for name, side in [(v.name, v.side_px) for v in PHASE1_VARIANTS]:
            fp = paths[name]
            tree = ET.parse(fp)
            r = tree.getroot()
            assert r.get("viewBox") == f"0 0 {side} {side}"


@pytest.mark.parametrize(
    "svg_snippet,expected_vb",
    [
        (
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 30 40"><path d="M0 0"/></svg>',
            (10.0, 20.0, 30.0, 40.0),
        ),
    ],
)
def test_read_view_box_from_string(svg_snippet: str, expected_vb: tuple) -> None:
    from io import BytesIO

    from defusedxml.ElementTree import parse as defused_parse

    root = defused_parse(BytesIO(svg_snippet.encode("utf-8"))).getroot()
    assert read_view_box(root) == expected_vb
