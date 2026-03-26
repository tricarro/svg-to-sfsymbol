"""Tests for the FastAPI convert endpoint."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

MINIMAL_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <g id="Symbols">
    <g id="Regular-L" transform="matrix(1 0 0 1 50 60)">
      <path class="SFSymbolsPreviewWireframe" d="M0 0 L10 0 L10 10 L0 10 Z"/>
    </g>
  </g>
</svg>"""

STROKED_SVG = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path d="M 3 12 L 21 12" stroke="#000000" stroke-width="2"
        stroke-linecap="round" fill="none"/>
</svg>"""


@pytest.fixture
def template_path(tmp_path: Path) -> Path:
    p = tmp_path / "square_template.svg"
    p.write_text(MINIMAL_TEMPLATE, encoding="utf-8")
    return p


def test_convert_happy_path(monkeypatch: pytest.MonkeyPatch, template_path: Path) -> None:
    monkeypatch.setenv("SFSYMBOL_TEMPLATE_PATH", str(template_path))
    from svg_to_sfsymbol.web_api import app

    client = TestClient(app)
    res = client.post(
        "/api/convert",
        files={"file": ("icon.svg", STROKED_SVG.encode("utf-8"), "image/svg+xml")},
    )
    assert res.status_code == 200
    assert "image/svg+xml" in res.headers.get("content-type", "")
    assert "attachment" in res.headers.get("content-disposition", "").lower()
    assert b"<svg" in res.content
    assert b"Symbols" in res.content


def test_convert_no_template_503(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SFSYMBOL_TEMPLATE_PATH", raising=False)
    monkeypatch.setattr(
        "svg_to_sfsymbol.web_api.default_square_template_path",
        lambda: None,
    )
    from svg_to_sfsymbol.web_api import app

    client = TestClient(app)
    res = client.post(
        "/api/convert",
        files={"file": ("icon.svg", STROKED_SVG.encode("utf-8"), "image/svg+xml")},
    )
    assert res.status_code == 503
    body = res.json()
    assert "detail" in body


def test_convert_rejects_non_svg(monkeypatch: pytest.MonkeyPatch, template_path: Path) -> None:
    monkeypatch.setenv("SFSYMBOL_TEMPLATE_PATH", str(template_path))
    from svg_to_sfsymbol.web_api import app

    client = TestClient(app)
    res = client.post(
        "/api/convert",
        files={"file": ("readme.txt", b"hello", "text/plain")},
    )
    assert res.status_code == 400


def test_convert_rejects_empty_file(
    monkeypatch: pytest.MonkeyPatch, template_path: Path
) -> None:
    monkeypatch.setenv("SFSYMBOL_TEMPLATE_PATH", str(template_path))
    from svg_to_sfsymbol.web_api import app

    client = TestClient(app)
    res = client.post(
        "/api/convert",
        files={"file": ("empty.svg", b"", "image/svg+xml")},
    )
    assert res.status_code == 400


def test_template_env_missing_file_raises_503(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    missing = tmp_path / "nope.svg"
    monkeypatch.setenv("SFSYMBOL_TEMPLATE_PATH", str(missing))
    from svg_to_sfsymbol.web_api import app

    client = TestClient(app)
    res = client.post(
        "/api/convert",
        files={"file": ("icon.svg", STROKED_SVG.encode("utf-8"), "image/svg+xml")},
    )
    assert res.status_code == 503
