"""HTTP API for SVG → SF Symbol conversion."""

from __future__ import annotations

import os
import re
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from svg_to_sfsymbol.phase5 import default_square_template_path
from svg_to_sfsymbol.pipeline import run_full_convert

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
_ENV_TEMPLATE = "SFSYMBOL_TEMPLATE_PATH"

app = FastAPI(title="SVG to SF Symbol API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _safe_stem(name: str) -> str:
    base = Path(name).name
    stem = Path(base).stem
    if not stem:
        stem = "upload"
    stem = re.sub(r"[^a-zA-Z0-9._-]+", "_", stem).strip("._-") or "upload"
    if len(stem) > 120:
        stem = stem[:120]
    return stem


def resolve_square_template() -> Optional[Path]:
    """Template path from env, else packaged default."""
    raw = os.environ.get(_ENV_TEMPLATE)
    if raw:
        p = Path(raw).expanduser().resolve()
        if not p.is_file():
            raise FileNotFoundError(
                f"{_ENV_TEMPLATE} is set but file not found: {p}"
            )
        return p
    return default_square_template_path()


def _convert_sync(svg_bytes: bytes, original_filename: str) -> tuple[bytes, str]:
    if len(svg_bytes) > MAX_UPLOAD_BYTES:
        raise ValueError(f"SVG exceeds maximum size ({MAX_UPLOAD_BYTES} bytes).")

    if not original_filename.lower().endswith(".svg"):
        raise ValueError("Only .svg uploads are supported.")

    stem = _safe_stem(original_filename)

    template = resolve_square_template()
    if template is None:
        raise FileNotFoundError(
            f"No SF Symbol square template found. Set {_ENV_TEMPLATE} to the template "
            "file path, or add resources/square_template.svg next to the project src tree."
        )

    with TemporaryDirectory(prefix="svg2sfs_") as tmp:
        work = Path(tmp)
        input_path = work / f"{stem}.svg"
        input_path.write_bytes(svg_bytes)

        out_svg = work / f"{stem}_SFSymbol.svg"
        result = run_full_convert(
            input_path,
            work,
            phase5_template=template,
            phase5_out=out_svg,
            phase5_missing="skip",
        )
        merged = result.merged_svg
        if merged is None or not merged.is_file():
            raise RuntimeError("Conversion finished without a merged SVG output.")
        data = merged.read_bytes()

    return data, f"{stem}_SFSymbol.svg"


@app.post("/api/convert")
async def convert(file: UploadFile = File(...)) -> Response:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing file name.")

    body = await file.read()
    if len(body) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {MAX_UPLOAD_BYTES} bytes).",
        )
    if len(body) == 0:
        raise HTTPException(status_code=400, detail="Empty file.")

    try:
        data, download_name = await run_in_threadpool(_convert_sync, body, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Conversion failed: {e}") from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    return Response(
        content=data,
        media_type="image/svg+xml",
        headers={
            "Content-Disposition": f'attachment; filename="{download_name}"',
        },
    )


_FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="static")
