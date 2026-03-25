"""CLI: Phase 1 size variants and Phase 2 weight duplicates."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import List, Optional

from svg_to_sfsymbol.phase1 import PHASE1_VARIANTS, run_phase1
from svg_to_sfsymbol.phase2 import PHASE2_WEIGHTS, run_phase2
from svg_to_sfsymbol.phase3 import run_phase3
from svg_to_sfsymbol.phase4 import run_phase4
from svg_to_sfsymbol.phase5 import default_square_template_path, run_phase5


def _cmd_convert(args: argparse.Namespace) -> int:
    input_path = args.input.expanduser().resolve()
    if not input_path.is_file():
        print(f"error: input not found: {input_path}", file=sys.stderr)
        return 1

    out = args.output_dir
    if out is None:
        out = input_path.parent / f"{input_path.stem}_phase1"
    else:
        out = out.expanduser().resolve()

    try:
        paths = run_phase1(
            input_path,
            out,
            original_name=args.original_name,
        )
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1

    print(f"Phase 1 — wrote under {out}:")
    print(f"  original -> {paths['original']}")
    for v in PHASE1_VARIANTS:
        print(f"  {v.name} ({v.side_px}px) -> {paths[v.name]}")

    if args.phase1_only:
        return 0

    try:
        p2 = run_phase2(out)
    except OSError as e:
        print(f"error: phase 2 failed: {e}", file=sys.stderr)
        return 1

    print(
        f"Phase 2 — wrote {len(p2)} files ({PHASE2_WEIGHTS[0]}-L … "
        f"{PHASE2_WEIGHTS[-1]}-S); removed large.svg, medium.svg, small.svg"
    )

    if args.skip_phase3:
        return 0

    p3 = run_phase3(out)
    touched = sum(1 for c in p3.values() if c > 0)
    print(
        f"Phase 3 — stroke-width applied in {len(p3)} icons "
        f"({touched} with ≥1 stroked element)"
    )

    if args.skip_phase4:
        return 0

    p4 = run_phase4(out)
    exp = sum(p4.values())
    print(
        f"Phase 4 — expanded strokes to fills in {len(p4)} icons "
        f"({exp} element conversions total)"
    )

    if args.skip_phase5:
        return 0

    tmpl_arg = args.phase5_template
    out_arg = args.phase5_out
    if (tmpl_arg is None) ^ (out_arg is None):
        print(
            "error: pass both --phase5-template and --phase5-out, or neither "
            "(defaults apply when neither is set).",
            file=sys.stderr,
        )
        return 1

    if tmpl_arg is not None and out_arg is not None:
        tmpl = tmpl_arg.expanduser().resolve()
        out_svg = out_arg.expanduser().resolve()
    else:
        tmpl = default_square_template_path()
        if tmpl is None:
            print(
                "Phase 5 — skipped (no default template; use --phase5-template "
                "and --phase5-out, or add resources/square_template.svg next to "
                "the project src tree).",
                file=sys.stderr,
            )
            return 0
        out_svg = (out / f"{input_path.stem}_sf_symbol.svg").resolve()

    stats = run_phase5(tmpl, out, out_svg, missing=args.phase5_missing)
    print(
        f"Phase 5 — merged template -> {out_svg} "
        f"({stats['filled']} slots filled, {stats['skipped']} missing icons skipped)"
    )
    return 0


def _cmd_phase2(args: argparse.Namespace) -> int:
    d = args.output_dir.expanduser().resolve()
    if not d.is_dir():
        print(f"error: not a directory: {d}", file=sys.stderr)
        return 1
    try:
        p2 = run_phase2(d)
    except FileNotFoundError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    except OSError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1

    print(
        f"Phase 2 — wrote {len(p2)} files under {d} ({PHASE2_WEIGHTS[0]}-L … "
        f"{PHASE2_WEIGHTS[-1]}-S); removed large.svg, medium.svg, small.svg"
    )
    return 0


def _cmd_phase3(args: argparse.Namespace) -> int:
    d = args.output_dir.expanduser().resolve()
    if not d.is_dir():
        print(f"error: not a directory: {d}", file=sys.stderr)
        return 1
    p3 = run_phase3(d)
    touched = sum(1 for c in p3.values() if c > 0)
    print(
        f"Phase 3 — stroke-width applied in {len(p3)} icons under {d} "
        f"({touched} with ≥1 stroked element)"
    )
    return 0


def _cmd_phase5(args: argparse.Namespace) -> int:
    t = args.template.expanduser().resolve()
    d = args.icons_dir.expanduser().resolve()
    o = args.output.expanduser().resolve()
    if not t.is_file():
        print(f"error: template not found: {t}", file=sys.stderr)
        return 1
    if not d.is_dir():
        print(f"error: not a directory: {d}", file=sys.stderr)
        return 1
    try:
        stats = run_phase5(t, d, o, missing=args.missing)
    except (ValueError, FileNotFoundError, NotADirectoryError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    print(
        f"Phase 5 — wrote {o} "
        f"({stats['filled']} slots filled, {stats['skipped']} missing icons skipped)"
    )
    return 0


def _cmd_phase4(args: argparse.Namespace) -> int:
    d = args.output_dir.expanduser().resolve()
    if not d.is_dir():
        print(f"error: not a directory: {d}", file=sys.stderr)
        return 1
    p4 = run_phase4(d)
    exp = sum(p4.values())
    print(
        f"Phase 4 — expanded strokes in {len(p4)} icons under {d} "
        f"({exp} element conversions total)"
    )
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    # Backward compatible: `python -m svg_to_sfsymbol icon.svg` → `convert icon.svg`
    if argv and argv[0] not in (
        "convert",
        "phase2",
        "phase3",
        "phase4",
        "phase5",
    ):
        argv = ["convert"] + argv

    parser = argparse.ArgumentParser(
        description=(
            "SVG → SF Symbol prep: phase 1 (sizes), phase 2 (weight files), "
            "phase 3 (stroke-width), phase 4 (stroke → filled outline), "
            "phase 5 (merge into Apple template)."
        )
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_convert = sub.add_parser(
        "convert",
        help="Run phases 1–5 by default (unless stopped early). Phase 5 uses "
        "resources/square_template.svg when present.",
    )
    p_convert.add_argument("input", type=Path, help="Input .svg file")
    p_convert.add_argument(
        "output_dir",
        type=Path,
        nargs="?",
        default=None,
        help="Output directory (default: <input_stem>_phase1 next to input)",
    )
    p_convert.add_argument(
        "--original-name",
        default="original.svg",
        help="Filename for the retained original (default: original.svg)",
    )
    p_convert.add_argument(
        "--phase1-only",
        action="store_true",
        help="Stop after phase 1 (keep large.svg, medium.svg, small.svg).",
    )
    p_convert.add_argument(
        "--skip-phase3",
        action="store_true",
        help="Stop after phase 2 (do not adjust stroke-width or expand strokes).",
    )
    p_convert.add_argument(
        "--skip-phase4",
        action="store_true",
        help="Stop after phase 3 (keep stroked paths; do not expand to fills).",
    )
    p_convert.add_argument(
        "--skip-phase5",
        action="store_true",
        help="After phase 4, do not merge into the SF Symbol template.",
    )
    p_convert.add_argument(
        "--phase5-template",
        type=Path,
        default=None,
        help=(
            "SF Symbol square template SVG. With --phase5-out, overrides the default "
            "(resources/square_template.svg next to the src tree when present)."
        ),
    )
    p_convert.add_argument(
        "--phase5-out",
        type=Path,
        default=None,
        help=(
            "Merged template output path. With --phase5-template, sets the destination; "
            "otherwise the default is <output_dir>/<input_stem>_sf_symbol.svg."
        ),
    )
    p_convert.add_argument(
        "--phase5-missing",
        choices=("skip", "warn", "fail"),
        default="skip",
        help="Phase 5 policy when an icon file is missing for a template slot.",
    )
    p_convert.set_defaults(func=_cmd_convert)

    p2 = sub.add_parser(
        "phase2",
        help="Run phase 2 only on a directory that already has phase 1 outputs.",
    )
    p2.add_argument(
        "output_dir",
        type=Path,
        help="Directory containing large.svg, medium.svg, small.svg from phase 1",
    )
    p2.set_defaults(func=_cmd_phase2)

    p3 = sub.add_parser(
        "phase3",
        help="Run phase 3 only: set stroke-width on *-{L,M,S}.svg files in a folder.",
    )
    p3.add_argument(
        "output_dir",
        type=Path,
        help="Directory containing Black-L.svg … Ultralight-S.svg",
    )
    p3.set_defaults(func=_cmd_phase3)

    p4 = sub.add_parser(
        "phase4",
        help="Run phase 4 only: expand strokes to filled paths in *-{L,M,S}.svg files.",
    )
    p4.add_argument(
        "output_dir",
        type=Path,
        help="Directory with phase-3-processed weight icons",
    )
    p4.set_defaults(func=_cmd_phase4)

    p5 = sub.add_parser(
        "phase5",
        help=(
            "Merge *-{L,M,S}.svg icons from a folder into an SF Symbol square template."
        ),
    )
    p5.add_argument(
        "template",
        type=Path,
        help="Square SF Symbol template SVG (e.g. square_template.svg)",
    )
    p5.add_argument(
        "icons_dir",
        type=Path,
        help="Directory containing Black-L.svg … Ultralight-S.svg",
    )
    p5.add_argument(
        "output",
        type=Path,
        help="Path for the merged SVG output",
    )
    p5.add_argument(
        "--missing",
        choices=("skip", "warn", "fail"),
        default="skip",
        help="If an icon file is missing for a slot: skip (keep wireframe), warn, or fail.",
    )
    p5.set_defaults(func=_cmd_phase5)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
