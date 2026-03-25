"""Tests for Phase 3 stroke-width table and application."""

from __future__ import annotations

import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET

from svg_to_sfsymbol.phase1 import run_phase1
from svg_to_sfsymbol.phase2 import run_phase2
from svg_to_sfsymbol.phase3 import (
    STROKE_WIDTH_BY_WEIGHT_SUFFIX,
    apply_stroke_widths_to_tree,
    parse_weight_stem,
    run_phase3,
)


def test_parse_weight_stem() -> None:
    assert parse_weight_stem("Regular-M") == ("Regular", "M")
    assert parse_weight_stem("Semibold-S") == ("Semibold", "S")
    assert parse_weight_stem("Black-L") == ("Black", "L")
    assert parse_weight_stem("original") is None
    assert parse_weight_stem("NotAWeight-M") is None


def test_stroke_table_covers_all_weights() -> None:
    assert len(STROKE_WIDTH_BY_WEIGHT_SUFFIX) == 9 * 3


def test_run_phase3_sets_widths() -> None:
    p = Path(__file__).resolve().parent.parent / "resources" / "calendar-today.svg"
    with tempfile.TemporaryDirectory() as td:
        out = Path(td)
        run_phase1(p, out)
        run_phase2(out)
        counts = run_phase3(out)
        assert len(counts) == 27
        assert counts["Regular-M"] == 5  # five stroked paths; one fill-only

        tree = ET.parse(out / "Regular-M.svg")
        root = tree.getroot()
        paths = root.findall(".//{http://www.w3.org/2000/svg}path")
        stroked = [e for e in paths if e.get("stroke")]
        assert len(stroked) == 5
        for el in stroked:
            assert el.get("stroke-width") == "8"

        tree_b = ET.parse(out / "Black-L.svg")
        paths_b = tree_b.getroot().findall(".//{http://www.w3.org/2000/svg}path")
        stroked_b = [e for e in paths_b if e.get("stroke")]
        for el in stroked_b:
            assert el.get("stroke-width") == "21"


def test_apply_stroke_widths_inline_style() -> None:
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
    <path d="M0 0 L10 10" style="stroke:#000;stroke-linecap:round"/>
    </svg>"""
    from io import BytesIO

    from defusedxml.ElementTree import parse as defused_parse

    root = defused_parse(BytesIO(svg.encode("utf-8"))).getroot()
    apply_stroke_widths_to_tree(root, 7.5)
    path = root.find("{http://www.w3.org/2000/svg}path")
    assert path is not None
    style = path.get("style", "")
    assert "stroke-width:7.5" in style.replace(" ", "")
