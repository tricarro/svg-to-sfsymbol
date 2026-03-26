"""Tests for Phase 4 stroke → filled outline."""

from __future__ import annotations

import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET

from svg_to_sfsymbol.phase1 import run_phase1
from svg_to_sfsymbol.phase2 import run_phase2
from svg_to_sfsymbol.phase3 import run_phase3
from svg_to_sfsymbol.phase4 import expand_strokes_in_tree, run_phase4


def _ns():
    return {"svg": "http://www.w3.org/2000/svg"}


def test_expand_strokes_open_path_no_stroke_attr_after() -> None:
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
    <path d="M 1 5 L 9 5" stroke="#000" stroke-width="2" stroke-linecap="round"/>
    </svg>"""
    from io import BytesIO

    from defusedxml.ElementTree import parse as defused_parse

    root = defused_parse(BytesIO(svg.encode("utf-8"))).getroot()
    n = expand_strokes_in_tree(root, flatness=0.5)
    assert n == 1
    paths = root.findall(".//svg:path", _ns())
    assert len(paths) == 1
    p = paths[0]
    assert p.get("stroke") is None
    assert p.get("fill") == "#000"
    assert p.get("d") and "L" in p.get("d", "")


def test_phase4_pipeline_calendar() -> None:
    p = Path(__file__).resolve().parent.parent / "resources" / "calendar-today.svg"
    with tempfile.TemporaryDirectory() as td:
        out = Path(td)
        run_phase1(p, out)
        run_phase2(out)
        run_phase3(out)
        counts = run_phase4(out)
        assert counts["Regular-M"] == 5
        tree = ET.parse(out / "Regular-M.svg")
        r = tree.getroot()
        paths = r.findall(".//{http://www.w3.org/2000/svg}path")
        # Merge disabled: 1 fill-only path + 5 stroke→fill conversions = 6 paths.
        assert len(paths) == 6
        for el in paths:
            assert el.get("stroke") is None
            assert el.get("stroke-width") is None


def test_dasharray_skipped() -> None:
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
    <path d="M 0 0 L 10 10" stroke="#000" stroke-width="2" stroke-dasharray="2 2"/>
    </svg>"""
    from io import BytesIO

    from defusedxml.ElementTree import parse as defused_parse

    root = defused_parse(BytesIO(svg.encode("utf-8"))).getroot()
    n = expand_strokes_in_tree(root)
    assert n == 0
    p = root.find(".//{http://www.w3.org/2000/svg}path")
    assert p is not None
    assert p.get("stroke") == "#000"
