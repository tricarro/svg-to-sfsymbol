"""Full convert pipeline (phases 1–5) shared by CLI and web API."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Literal, Optional

from svg_to_sfsymbol.phase1 import run_phase1
from svg_to_sfsymbol.phase2 import run_phase2
from svg_to_sfsymbol.phase3 import run_phase3
from svg_to_sfsymbol.phase4 import run_phase4
from svg_to_sfsymbol.phase5 import default_square_template_path, run_phase5

Phase5Missing = Literal["skip", "warn", "fail"]


@dataclass(frozen=True)
class FullConvertResult:
    """Paths after a full or partial convert run."""

    out_dir: Path
    input_stem: str
    phase1_paths: Dict[str, Path]
    merged_svg: Optional[Path]
    phase5_stats: Optional[dict]
    phase3_counts: Optional[Dict[str, int]] = None
    phase4_counts: Optional[Dict[str, int]] = None
    phase2_written: Optional[Dict[str, Path]] = None


def run_full_convert(
    input_path: Path,
    out_dir: Path,
    *,
    original_name: str = "original.svg",
    phase1_only: bool = False,
    skip_phase3: bool = False,
    skip_phase4: bool = False,
    skip_phase5: bool = False,
    phase5_template: Optional[Path] = None,
    phase5_out: Optional[Path] = None,
    phase5_missing: Phase5Missing = "skip",
    require_merged_svg: bool = False,
) -> FullConvertResult:
    """
    Run phase 1 (and by default phases 2–5) writing under ``out_dir``.

    ``phase5_template`` / ``phase5_out`` follow CLI rules: both set or both unset.
    If unset, the default template path is used when present; otherwise phase 5 is
    skipped unless ``require_merged_svg`` is True, in which case a ``FileNotFoundError``
    is raised.
    """
    input_path = input_path.expanduser().resolve()
    out_dir = out_dir.expanduser().resolve()
    if not input_path.is_file():
        raise FileNotFoundError(f"input not found: {input_path}")

    p1 = run_phase1(input_path, out_dir, original_name=original_name)

    if phase1_only:
        return FullConvertResult(
            out_dir=out_dir,
            input_stem=input_path.stem,
            phase1_paths=p1,
            merged_svg=None,
            phase5_stats=None,
        )

    p2 = run_phase2(out_dir)

    if skip_phase3:
        return FullConvertResult(
            out_dir=out_dir,
            input_stem=input_path.stem,
            phase1_paths=p1,
            merged_svg=None,
            phase5_stats=None,
            phase2_written=p2,
        )

    p3 = run_phase3(out_dir)

    if skip_phase4:
        return FullConvertResult(
            out_dir=out_dir,
            input_stem=input_path.stem,
            phase1_paths=p1,
            merged_svg=None,
            phase5_stats=None,
            phase2_written=p2,
            phase3_counts=p3,
        )

    p4 = run_phase4(out_dir)

    if skip_phase5:
        return FullConvertResult(
            out_dir=out_dir,
            input_stem=input_path.stem,
            phase1_paths=p1,
            merged_svg=None,
            phase5_stats=None,
            phase2_written=p2,
            phase3_counts=p3,
            phase4_counts=p4,
        )

    if (phase5_template is None) ^ (phase5_out is None):
        raise ValueError(
            "pass both phase5_template and phase5_out, or neither "
            "(defaults apply when neither is set)."
        )

    if phase5_template is not None and phase5_out is not None:
        tmpl = phase5_template.expanduser().resolve()
        out_svg = phase5_out.expanduser().resolve()
    else:
        tmpl = default_square_template_path()
        if tmpl is None:
            if require_merged_svg:
                raise FileNotFoundError(
                    "No SF Symbol square template found. Set SFSYMBOL_TEMPLATE_PATH "
                    "or add resources/square_template.svg next to the project src tree."
                )
            return FullConvertResult(
                out_dir=out_dir,
                input_stem=input_path.stem,
                phase1_paths=p1,
                merged_svg=None,
                phase5_stats=None,
                phase2_written=p2,
                phase3_counts=p3,
                phase4_counts=p4,
            )
        out_svg = (out_dir / f"{input_path.stem}_SFSymbol.svg").resolve()

    stats = run_phase5(tmpl, out_dir, out_svg, missing=phase5_missing)
    return FullConvertResult(
        out_dir=out_dir,
        input_stem=input_path.stem,
        phase1_paths=p1,
        merged_svg=out_svg,
        phase5_stats=dict(stats),
        phase2_written=p2,
        phase3_counts=p3,
        phase4_counts=p4,
    )
