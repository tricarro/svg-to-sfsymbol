"""Tests for Phase 2 weight duplicates."""

from __future__ import annotations

import tempfile
from pathlib import Path

from svg_to_sfsymbol.phase1 import PHASE1_VARIANTS, run_phase1
from svg_to_sfsymbol.phase2 import PHASE2_WEIGHTS, run_phase2


def test_run_phase2_duplicates_and_removes_size_files() -> None:
    p = Path(__file__).resolve().parent.parent / "resources" / "calendar-today.svg"
    with tempfile.TemporaryDirectory() as td:
        out = Path(td)
        run_phase1(p, out)
        assert (out / "large.svg").is_file()
        paths = run_phase2(out)
        assert len(paths) == len(PHASE2_WEIGHTS) * len(PHASE1_VARIANTS)
        assert not (out / "large.svg").exists()
        assert not (out / "medium.svg").exists()
        assert not (out / "small.svg").exists()
        assert (out / "original.svg").is_file()
        assert (out / "Regular-L.svg").is_file()
        assert (out / "Ultralight-S.svg").is_file()
        assert paths["Black-L"].read_bytes() == paths["Ultralight-L"].read_bytes()


def test_run_phase2_missing_large_raises() -> None:
    with tempfile.TemporaryDirectory() as td:
        out = Path(td)
        (out / "medium.svg").write_text("<svg/>")
        (out / "small.svg").write_text("<svg/>")
        try:
            run_phase2(out)
        except FileNotFoundError as e:
            assert "large.svg" in str(e)
        else:
            raise AssertionError("expected FileNotFoundError")
