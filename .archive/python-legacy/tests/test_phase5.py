"""Tests for Phase 5 template merge."""

from __future__ import annotations

import re
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest

from svg_to_sfsymbol.phase5 import (
    default_square_template_path,
    run_phase5,
    _wireframe_bbox,
)


def test_wireframe_bbox_square() -> None:
    bx, by, bw, bh = _wireframe_bbox("M0 0 L10 0 L10 10 L0 10 Z")
    assert (bx, by, bw, bh) == (0.0, 0.0, 10.0, 10.0)


def test_phase5_centers_icon_removes_wireframe(tmp_path: Path) -> None:
    template = tmp_path / "t.svg"
    template.write_text(
        """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <g id="Symbols">
    <g id="Regular-L" transform="matrix(1 0 0 1 50 60)">
      <path class="SFSymbolsPreviewWireframe" d="M0 0 L10 0 L10 10 L0 10 Z"/>
    </g>
  </g>
</svg>""",
        encoding="utf-8",
    )
    icons = tmp_path / "icons"
    icons.mkdir()
    (icons / "Regular-L.svg").write_text(
        """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <path id="glyph" d="M0 0 L120 0 L120 120 L0 120 Z" fill="#111"/>
</svg>""",
        encoding="utf-8",
    )
    out = tmp_path / "merged.svg"
    stats = run_phase5(template, icons, out, missing="skip")
    assert stats["filled"] == 1
    assert stats["skipped"] == 0

    tree = ET.parse(out)
    root = tree.getroot()
    ns = {"svg": "http://www.w3.org/2000/svg"}
    wire = root.findall('.//svg:path[@class="SFSymbolsPreviewWireframe"]', ns)
    assert len(wire) == 0

    slot = root.find('.//svg:g[@id="Regular-L"]', ns)
    assert slot is not None
    groups = [c for c in slot if c.tag.endswith("}g") or c.tag == "g"]
    assert len(groups) == 1
    wrap = groups[0]
    tf = wrap.get("transform", "")
    m = re.fullmatch(r"translate\(\s*([-\d.]+)\s+([-\d.]+)\s*\)", tf.strip())
    assert m is not None, tf
    tx, ty = float(m.group(1)), float(m.group(2))
    # Wireframe 10×10 centered at (5,5); icon viewBox 120×120 centered at (60,60).
    assert abs(tx - (-55.0)) < 1e-5
    assert abs(ty - (-55.0)) < 1e-5

    paths = wrap.findall(".//svg:path", ns)
    assert len(paths) == 1
    assert paths[0].get("fill") == "#111"


def test_phase5_missing_fail(tmp_path: Path) -> None:
    template = tmp_path / "t.svg"
    template.write_text(
        """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <g id="Symbols">
    <g id="Regular-L" transform="matrix(1 0 0 1 0 0)">
      <path class="SFSymbolsPreviewWireframe" d="M0 0 L10 0 L10 10 L0 10 Z"/>
    </g>
  </g>
</svg>""",
        encoding="utf-8",
    )
    icons = tmp_path / "empty"
    icons.mkdir()
    with pytest.raises(FileNotFoundError):
        run_phase5(template, icons, tmp_path / "out.svg", missing="fail")


def test_phase5_missing_skip_counts(tmp_path: Path) -> None:
    template = tmp_path / "t.svg"
    template.write_text(
        """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <g id="Symbols">
    <g id="Regular-L" transform="matrix(1 0 0 1 0 0)">
      <path class="SFSymbolsPreviewWireframe" d="M0 0 L10 0 L10 10 L0 10 Z"/>
    </g>
    <g id="Bold-M" transform="matrix(1 0 0 1 0 0)">
      <path class="SFSymbolsPreviewWireframe" d="M0 0 L10 0 L10 10 L0 10 Z"/>
    </g>
  </g>
</svg>""",
        encoding="utf-8",
    )
    icons = tmp_path / "icons"
    icons.mkdir()
    (icons / "Regular-L.svg").write_text(
        """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <path d="M0 0h120v120H0z" fill="black"/>
</svg>""",
        encoding="utf-8",
    )
    out = tmp_path / "merged.svg"
    stats = run_phase5(template, icons, out, missing="skip")
    assert stats["filled"] == 1
    assert stats["skipped"] == 1
    assert stats["missing_ids"] == ["Bold-M"]

    tree = ET.parse(out)
    root = tree.getroot()
    ns = {"svg": "http://www.w3.org/2000/svg"}
    bold = root.find('.//svg:g[@id="Bold-M"]', ns)
    assert bold is not None
    w = bold.find('svg:path[@class="SFSymbolsPreviewWireframe"]', ns)
    assert w is not None


def test_phase5_square_template_smoke(tmp_path: Path) -> None:
    """Run phase 1–4 on calendar, merge all 27 slots into the real Apple template."""
    repo = Path(__file__).resolve().parent.parent
    template = repo / "resources" / "square_template.svg"
    if not template.is_file():
        pytest.skip("square_template.svg not in repo")
    src = repo / "resources" / "calendar-today.svg"
    work = tmp_path / "work"
    from svg_to_sfsymbol.phase1 import run_phase1
    from svg_to_sfsymbol.phase2 import run_phase2
    from svg_to_sfsymbol.phase3 import run_phase3
    from svg_to_sfsymbol.phase4 import run_phase4

    run_phase1(src, work)
    run_phase2(work)
    run_phase3(work)
    run_phase4(work)
    out = tmp_path / "symbol.svg"
    stats = run_phase5(template, work, out, missing="fail")
    assert stats["filled"] == 27
    assert stats["skipped"] == 0
    assert out.is_file()
    tree = ET.parse(out)
    root = tree.getroot()
    ns = {"svg": "http://www.w3.org/2000/svg"}
    wire = root.findall('.//svg:path[@class="SFSymbolsPreviewWireframe"]', ns)
    assert len(wire) == 0


def test_default_square_template_path_in_repo() -> None:
    repo = Path(__file__).resolve().parent.parent
    expected = repo / "resources" / "square_template.svg"
    if not expected.is_file():
        pytest.skip("square_template.svg not in repo")
    assert default_square_template_path() == expected


def test_convert_runs_phase5_by_default(tmp_path: Path) -> None:
    import subprocess
    import sys

    repo = Path(__file__).resolve().parent.parent
    if not (repo / "resources" / "square_template.svg").is_file():
        pytest.skip("square_template.svg not in repo")
    src = repo / "resources" / "calendar-today.svg"
    out_dir = tmp_path / "out"
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "svg_to_sfsymbol",
            "convert",
            str(src),
            str(out_dir),
        ],
        cwd=str(repo),
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    merged = out_dir / "calendar-today_SFSymbol.svg"
    assert merged.is_file()


def test_convert_skip_phase5_no_merged_file(tmp_path: Path) -> None:
    import subprocess
    import sys

    repo = Path(__file__).resolve().parent.parent
    if not (repo / "resources" / "square_template.svg").is_file():
        pytest.skip("square_template.svg not in repo")
    src = repo / "resources" / "calendar-today.svg"
    out_dir = tmp_path / "out_skip"
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "svg_to_sfsymbol",
            "convert",
            str(src),
            str(out_dir),
            "--skip-phase5",
        ],
        cwd=str(repo),
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0
    assert not (out_dir / "calendar-today_SFSymbol.svg").exists()
