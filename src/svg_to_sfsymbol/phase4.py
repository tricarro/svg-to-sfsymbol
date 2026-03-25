"""
Phase 4: expand stroked geometry into filled outlines (stroke → fill).

**Stroke model (v1)**

- **Centered stroke:** outline is ``geometry.buffer(stroke_width / 2, …)`` in user space.
- **Caps / joins:** Mapped from ``stroke-linecap`` / ``stroke-linejoin`` to Shapely
  ``CAP_STYLE`` / ``JOIN_STYLE`` (``butt``→flat, ``round``, ``square``; ``miter``,
  ``round``, ``bevel``). ``stroke-miterlimit`` is passed through to ``buffer``.
- **Closed vs open:** Parsed from ``path`` ``d`` (``Close`` / ``Z`` subpaths use a
  ``LinearRing``; otherwise ``LineString``). Multiple subpaths are buffered and
  ``unary_union``'d.
- **Not supported (v1):** ``stroke-dasharray`` — element is left unchanged.
- **Fill + stroke on same element:** Stroke is expanded to a **new** sibling
  ``path`` (filled with the stroke paint, drawn after the original so it sits on
  top); the original keeps its fill and loses stroke attributes.
- **Geometry:** Subpaths are flattened from Béziers/arcs to polylines (adaptive
  sampling), then buffered with **Shapely** (polygonal approximation of true curve
  offset).

Fill-only paths are not modified.

After stroke expansion, **merge** pass: sibling ``path`` elements with the same
fill (and fill-rule / fill-opacity) and no stroke are combined via
``unary_union`` into a single path where possible (fewer DOM nodes, one compound
``d``). Paths under ``defs`` are not merged.
"""

from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path
from typing import List, Optional, Tuple
from xml.etree import ElementTree as ET

from shapely import make_valid
from shapely.geometry import (
    CAP_STYLE,
    JOIN_STYLE,
    LineString,
    LinearRing,
    MultiPolygon,
    Point,
    Polygon,
)
from shapely.ops import unary_union
from svg.path import Arc, Close, CubicBezier, Line, Move, QuadraticBezier, parse_path

from svg_to_sfsymbol.phase1 import element_to_bytes, parse_svg_file
from svg_to_sfsymbol.phase3 import (
    _element_is_stroked,
    _local_tag,
    _parse_style,
    parse_weight_stem,
)

SVG_NS = "http://www.w3.org/2000/svg"
_PATH_TAG = f"{{{SVG_NS}}}path"

_COORD_EPS = 1e-7
_NUM_RE = re.compile(r"[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?")


def _dedupe_append(pts: List[Tuple[float, float]], x: float, y: float) -> None:
    if pts and abs(pts[-1][0] - x) < _COORD_EPS and abs(pts[-1][1] - y) < _COORD_EPS:
        return
    pts.append((x, y))


def _sample_cubic(seg: CubicBezier, flatness: float) -> List[Tuple[float, float]]:
    ln = max(1e-6, seg.length())
    n = max(4, min(256, int(ln / flatness) + 1))
    out: List[Tuple[float, float]] = []
    for i in range(n):
        t = i / (n - 1) if n > 1 else 0.0
        z = seg.point(t)
        out.append((z.real, z.imag))
    return out


def _sample_quad(seg: QuadraticBezier, flatness: float) -> List[Tuple[float, float]]:
    ln = max(1e-6, seg.length())
    n = max(4, min(256, int(ln / flatness) + 1))
    out: List[Tuple[float, float]] = []
    for i in range(n):
        t = i / (n - 1) if n > 1 else 0.0
        z = seg.point(t)
        out.append((z.real, z.imag))
    return out


def _sample_arc(seg: Arc, segments: int = 48) -> List[Tuple[float, float]]:
    out: List[Tuple[float, float]] = []
    for i in range(segments + 1):
        z = seg.point(i / segments)
        out.append((z.real, z.imag))
    return out


def _flatten_path_to_subpaths(
    d: str, flatness: float
) -> List[Tuple[List[Tuple[float, float]], bool]]:
    """Each item is (polyline vertices, is_closed)."""
    if not d or not d.strip():
        return []
    try:
        p = parse_path(d)
    except Exception:
        return []

    subpaths: List[Tuple[List[Tuple[float, float]], bool]] = []
    current: List[Tuple[float, float]] = []
    closed = False

    def flush() -> None:
        nonlocal current, closed
        if len(current) >= 2:
            subpaths.append((current[:], closed))
        current, closed = [], False

    for seg in p:
        if isinstance(seg, Move):
            flush()
            _dedupe_append(current, seg.end.real, seg.end.imag)
        elif isinstance(seg, Close):
            closed = True
        elif isinstance(seg, Line):
            _dedupe_append(current, seg.end.real, seg.end.imag)
        elif isinstance(seg, CubicBezier):
            for x, y in _sample_cubic(seg, flatness):
                _dedupe_append(current, x, y)
        elif isinstance(seg, QuadraticBezier):
            for x, y in _sample_quad(seg, flatness):
                _dedupe_append(current, x, y)
        elif isinstance(seg, Arc):
            for x, y in _sample_arc(seg):
                _dedupe_append(current, x, y)
        else:
            continue

    flush()
    return subpaths


def _parse_points_attr(raw: str | None) -> List[Tuple[float, float]]:
    if not raw:
        return []
    nums = [float(x) for x in _NUM_RE.findall(raw)]
    if len(nums) % 2 != 0:
        return []
    return [(nums[i], nums[i + 1]) for i in range(0, len(nums), 2)]


def _has_dasharray(el: ET.Element) -> bool:
    da = el.get("stroke-dasharray")
    if da and da.strip() and da.strip() != "none":
        return True
    style = el.get("style")
    if style:
        sd = _parse_style(style)
        v = sd.get("stroke-dasharray", "").strip()
        if v and v != "none":
            return True
    return False


def _stroke_paint(el: ET.Element) -> str:
    s = el.get("stroke")
    if s and s.strip().lower() not in ("none", "transparent", ""):
        return s.strip()
    style = el.get("style")
    if style:
        sd = _parse_style(style)
        st = sd.get("stroke", "").strip()
        if st and st.lower() not in ("none", "transparent", ""):
            return st
    return "#000000"


def _stroke_width_px(el: ET.Element) -> float:
    sw = el.get("stroke-width")
    if sw:
        return float(sw.replace("px", "").strip())
    style = el.get("style")
    if style:
        sd = _parse_style(style)
        w = sd.get("stroke-width", "").replace("px", "").strip()
        if w:
            return float(w)
    return 1.0


def _cap_style(el: ET.Element):
    raw = (el.get("stroke-linecap") or "").strip().lower()
    if not raw:
        style = el.get("style")
        if style:
            raw = _parse_style(style).get("stroke-linecap", "").strip().lower()
    if raw == "round":
        return CAP_STYLE.round
    if raw == "square":
        return CAP_STYLE.square
    return CAP_STYLE.flat


def _join_style(el: ET.Element):
    raw = (el.get("stroke-linejoin") or "").strip().lower()
    if not raw:
        style = el.get("style")
        if style:
            raw = _parse_style(style).get("stroke-linejoin", "").strip().lower()
    if raw == "round":
        return JOIN_STYLE.round
    if raw == "bevel":
        return JOIN_STYLE.bevel
    return JOIN_STYLE.mitre


def _mitre_limit(el: ET.Element) -> float:
    raw = el.get("stroke-miterlimit")
    if raw:
        try:
            return float(raw)
        except ValueError:
            pass
    style = el.get("style")
    if style:
        v = _parse_style(style).get("stroke-miterlimit", "").strip()
        if v:
            try:
                return float(v)
            except ValueError:
                pass
    return 4.0


def _visible_fill(el: ET.Element) -> bool:
    f = el.get("fill")
    if f is not None:
        fl = f.strip().lower()
        if fl in ("none", "transparent", ""):
            return False
        return True
    style = el.get("style")
    if style:
        fl = _parse_style(style).get("fill", "").strip().lower()
        if fl in ("none", "transparent", ""):
            return False
        if fl:
            return True
    return False


def _strip_stroke_presentation(el: ET.Element) -> None:
    for k in (
        "stroke",
        "stroke-width",
        "stroke-linecap",
        "stroke-linejoin",
        "stroke-miterlimit",
        "stroke-dasharray",
        "stroke-dashoffset",
        "stroke-opacity",
    ):
        el.attrib.pop(k, None)
    style = el.get("style")
    if not style:
        return
    sd = _parse_style(style)
    for k in list(sd.keys()):
        if k.startswith("stroke"):
            del sd[k]
    if sd:
        el.set("style", ";".join(f"{k}:{v}" for k, v in sd.items()))
    else:
        el.attrib.pop("style", None)


def _ring_to_d(coords: List[Tuple[float, float]]) -> str:
    if len(coords) < 2:
        return ""
    c = list(coords)
    if len(c) >= 2 and abs(c[0][0] - c[-1][0]) < _COORD_EPS and abs(c[0][1] - c[-1][1]) < _COORD_EPS:
        c = c[:-1]
    if len(c) < 2:
        return ""
    parts = [f"M {c[0][0]:.6g},{c[0][1]:.6g}"]
    for x, y in c[1:]:
        parts.append(f"L {x:.6g},{y:.6g}")
    parts.append("Z")
    return " ".join(parts)


def _polygon_to_path_d(poly: Polygon) -> Tuple[str, bool]:
    """Return (d attribute, needs_evenodd)."""
    parts: List[str] = []
    parts.append(_ring_to_d(list(poly.exterior.coords)))
    for hole in poly.interiors:
        parts.append(_ring_to_d(list(hole.coords)))
    d = " ".join(p for p in parts if p).strip()
    needs_evenodd = bool(poly.interiors)
    return d, needs_evenodd


def _geometry_to_path_d(geom) -> Tuple[str, bool]:
    if geom.is_empty:
        return "", False
    if isinstance(geom, Polygon):
        return _polygon_to_path_d(geom)
    if isinstance(geom, MultiPolygon):
        chunks: List[str] = []
        needs = False
        for p in geom.geoms:
            d, ne = _polygon_to_path_d(p)
            if d:
                chunks.append(d)
            needs = needs or ne
        return " ".join(chunks).strip(), needs or len(geom.geoms) > 1
    if isinstance(geom, Point):
        return "", False
    # GeometryCollection etc.
    try:
        polys = [g for g in getattr(geom, "geoms", []) if isinstance(g, Polygon)]
        if not polys:
            return "", False
        return _geometry_to_path_d(MultiPolygon(polys))
    except Exception:
        return "", False


def _buffer_subpaths(
    subpaths: List[Tuple[List[Tuple[float, float]], bool]],
    half_w: float,
    cap,
    join,
    mitre: float,
    quad_segs: int = 8,
):
    geoms = []
    for coords, closed in subpaths:
        if len(coords) < 2:
            continue
        if closed and len(coords) >= 3:
            c = list(coords)
            if abs(c[0][0] - c[-1][0]) > _COORD_EPS or abs(c[0][1] - c[-1][1]) > _COORD_EPS:
                c.append(c[0])
            try:
                ring = LinearRing(c)
            except Exception:
                continue
            g = ring.buffer(
                half_w,
                quad_segs=quad_segs,
                cap_style=cap,
                join_style=join,
                mitre_limit=mitre,
            )
        else:
            g = LineString(coords).buffer(
                half_w,
                quad_segs=quad_segs,
                cap_style=cap,
                join_style=join,
                mitre_limit=mitre,
            )
        if not g.is_empty:
            geoms.append(g)
    if not geoms:
        return None
    u = unary_union(geoms)
    if u.is_empty:
        return None
    return u


def _outline_from_subpaths(
    subpaths: List[Tuple[List[Tuple[float, float]], bool]],
    el: ET.Element,
    flatness: float,
) -> Optional[Tuple[str, bool]]:
    sw = _stroke_width_px(el)
    if sw <= 0:
        return None
    half = sw / 2.0
    cap = _cap_style(el)
    join = _join_style(el)
    mitre = _mitre_limit(el)
    g = _buffer_subpaths(subpaths, half, cap, join, mitre)
    if g is None:
        return None
    return _geometry_to_path_d(g)


def _convert_path_element(
    el: ET.Element,
    parent: ET.Element,
    flatness: float,
) -> bool:
    if not _element_is_stroked(el) or _has_dasharray(el):
        return False
    d = el.get("d")
    if not d:
        return False
    subpaths = _flatten_path_to_subpaths(d, flatness)
    if not subpaths:
        return False
    out = _outline_from_subpaths(subpaths, el, flatness)
    if not out or not out[0]:
        return False
    path_d, evenodd = out
    paint = _stroke_paint(el)
    has_fill = _visible_fill(el)

    if has_fill:
        outline = ET.Element(_PATH_TAG)
        outline.set("d", path_d)
        outline.set("fill", paint)
        if evenodd:
            outline.set("fill-rule", "evenodd")
        idx = list(parent).index(el)
        parent.insert(idx + 1, outline)
        _strip_stroke_presentation(el)
    else:
        el.set("d", path_d)
        el.set("fill", paint)
        if evenodd:
            el.set("fill-rule", "evenodd")
        _strip_stroke_presentation(el)
    return True


def _line_subpaths(el: ET.Element) -> List[Tuple[List[Tuple[float, float]], bool]]:
    try:
        x1, y1 = float(el.get("x1", 0)), float(el.get("y1", 0))
        x2, y2 = float(el.get("x2", 0)), float(el.get("y2", 0))
    except ValueError:
        return []
    return [([(x1, y1), (x2, y2)], False)]


def _polyline_subpaths(el: ET.Element) -> List[Tuple[List[Tuple[float, float]], bool]]:
    pts = _parse_points_attr(el.get("points"))
    if len(pts) < 2:
        return []
    return [(pts, False)]


def _polygon_subpaths(el: ET.Element) -> List[Tuple[List[Tuple[float, float]], bool]]:
    pts = _parse_points_attr(el.get("points"))
    if len(pts) < 3:
        return []
    return [(pts, True)]


def _replace_with_path(
    parent: ET.Element,
    el: ET.Element,
    d: str,
    evenodd: bool,
) -> ET.Element:
    idx = list(parent).index(el)
    parent.remove(el)
    new_el = ET.Element(_PATH_TAG)
    new_el.set("d", d)
    if evenodd:
        new_el.set("fill-rule", "evenodd")
    parent.insert(idx, new_el)
    return new_el


def _convert_line_like_element_simple(
    el: ET.Element,
    parent: ET.Element,
    tag: str,
    flatness: float,
) -> bool:
    """line / polyline / polygon → single filled path (no fill+stroke split)."""
    if not _element_is_stroked(el) or _has_dasharray(el):
        return False
    if _visible_fill(el):
        # v1: skip mixed fill+stroke on primitives (rare)
        return False
    if tag == "line":
        subpaths = _line_subpaths(el)
    elif tag == "polyline":
        subpaths = _polyline_subpaths(el)
    elif tag == "polygon":
        subpaths = _polygon_subpaths(el)
    else:
        return False
    out = _outline_from_subpaths(subpaths, el, flatness)
    if not out or not out[0]:
        return False
    path_d, evenodd = out
    new_el = _replace_with_path(parent, el, path_d, evenodd)
    new_el.set("fill", _stroke_paint(el))
    return True


def _parent_map(root: ET.Element) -> dict[ET.Element, ET.Element]:
    return {child: parent for parent in root.iter() for child in list(parent)}


def _under_defs(el: ET.Element, pmap: dict[ET.Element, ET.Element]) -> bool:
    cur: ET.Element | None = el
    while cur is not None:
        if _local_tag(cur.tag) == "defs":
            return True
        cur = pmap.get(cur)
    return False


def _effective_fill(el: ET.Element) -> Optional[str]:
    """Paint string for grouping (attribute or style); None if none/transparent."""
    f = el.get("fill")
    if f is not None:
        fl = f.strip().lower()
        if fl in ("none", "transparent", ""):
            return None
        return f.strip()
    style = el.get("style")
    if style:
        fl = _parse_style(style).get("fill", "").strip()
        if not fl or fl.lower() in ("none", "transparent"):
            return None
        return fl
    return None


def _effective_fill_rule(el: ET.Element) -> str:
    r = (el.get("fill-rule") or "").strip().lower()
    if r in ("evenodd", "nonzero"):
        return r
    style = el.get("style")
    if style:
        r2 = _parse_style(style).get("fill-rule", "").strip().lower()
        if r2 in ("evenodd", "nonzero"):
            return r2
    return "nonzero"


def _effective_fill_opacity(el: ET.Element) -> str:
    o = el.get("fill-opacity")
    if o is not None and o.strip() != "":
        return o.strip()
    style = el.get("style")
    if style:
        o2 = _parse_style(style).get("fill-opacity", "").strip()
        if o2:
            return o2
    return "1"


def _path_merge_signature(el: ET.Element) -> Optional[Tuple[str, str, str]]:
    """Group key: (fill, fill_rule, fill_opacity). None if not mergeable."""
    fill = _effective_fill(el)
    if fill is None:
        return None
    if el.get("clip-path") or el.get("mask"):
        return None
    style = el.get("style") or ""
    sd = _parse_style(style) if style else {}
    if sd.get("clip-path") or sd.get("mask"):
        return None
    stroke_attr = el.get("stroke")
    if stroke_attr and stroke_attr.strip().lower() not in ("none", "", "transparent"):
        return None
    st = sd.get("stroke", "").strip().lower()
    if st and st not in ("none", "transparent"):
        return None
    return (fill.lower(), _effective_fill_rule(el), _effective_fill_opacity(el))


def _path_d_to_geometry(d: str, flatness: float):
    """Turn a filled path's ``d`` into a polygonal geometry (union of closed subpaths)."""
    subpaths = _flatten_path_to_subpaths(d, flatness)
    polys: List[Polygon] = []
    for coords, closed in subpaths:
        if not closed or len(coords) < 3:
            continue
        c = list(coords)
        if abs(c[0][0] - c[-1][0]) > _COORD_EPS or abs(c[0][1] - c[-1][1]) > _COORD_EPS:
            c.append(c[0])
        try:
            poly = Polygon(c)
            if not poly.is_valid:
                fixed = make_valid(poly)
                if isinstance(fixed, Polygon) and not fixed.is_empty:
                    polys.append(fixed)
                else:
                    for g in getattr(fixed, "geoms", []):
                        if isinstance(g, Polygon) and not g.is_empty:
                            polys.append(g)
            elif not poly.is_empty:
                polys.append(poly)
        except Exception:
            continue
    if not polys:
        return None
    if len(polys) == 1:
        return polys[0]
    return unary_union(polys)


def _merge_fill_paths_for_parent(
    parent: ET.Element, pmap: dict[ET.Element, ET.Element], flatness: float
) -> int:
    """Union sibling paths with identical fill signature. Returns number of paths removed."""
    paths = [
        c
        for c in list(parent)
        if _local_tag(c.tag) == "path"
        and not _under_defs(c, pmap)
        and _path_merge_signature(c) is not None
    ]
    if len(paths) < 2:
        return 0
    groups: dict[Tuple[str, str, str], List[ET.Element]] = defaultdict(list)
    for p in paths:
        sig = _path_merge_signature(p)
        if sig:
            groups[sig].append(p)
    removed = 0
    for _sig, plist in groups.items():
        if len(plist) < 2:
            continue
        geoms = []
        for p in plist:
            g = _path_d_to_geometry(p.get("d") or "", flatness)
            if g is not None and not g.is_empty:
                geoms.append(g)
        if len(geoms) < 2:
            continue
        try:
            u = unary_union(geoms)
        except Exception:
            continue
        if u.is_empty:
            continue
        d_out, evenodd = _geometry_to_path_d(u)
        if not d_out:
            continue
        keeper = plist[0]
        keeper.set("d", d_out)
        if evenodd:
            keeper.set("fill-rule", "evenodd")
        elif keeper.get("fill-rule") == "evenodd":
            keeper.attrib.pop("fill-rule", None)
        for p in plist[1:]:
            parent.remove(p)
        removed += len(plist) - 1
    return removed


def merge_fill_paths_in_tree(root: ET.Element, *, flatness: float = 1.0) -> int:
    """Merge sibling filled paths that share the same fill paint. Returns paths removed."""
    pmap = _parent_map(root)
    total = 0
    for parent in list(root.iter()):
        total += _merge_fill_paths_for_parent(parent, pmap, flatness)
    return total


def expand_strokes_in_tree(root: ET.Element, *, flatness: float = 1.0) -> int:
    """
    Convert stroked paths (and stroke-only line/polyline/polygon) to filled outlines.
    Returns count of elements converted or split.
    """
    converted = 0
    # Multiple passes: path conversion can insert siblings; process paths in document
    # order by repeated scan until stable.
    changed = True
    while changed:
        changed = False
        pmap = _parent_map(root)
        for el in list(root.iter()):
            tag = _local_tag(el.tag)
            parent = pmap.get(el)
            if parent is None:
                continue
            if tag == "path":
                if _convert_path_element(el, parent, flatness):
                    converted += 1
                    changed = True
            elif tag == "line":
                if _convert_line_like_element_simple(el, parent, tag, flatness):
                    converted += 1
                    changed = True
            elif tag == "polyline":
                if _convert_line_like_element_simple(el, parent, tag, flatness):
                    converted += 1
                    changed = True
            elif tag == "polygon":
                if _convert_line_like_element_simple(el, parent, tag, flatness):
                    converted += 1
                    changed = True
    merge_fill_paths_in_tree(root, flatness=flatness)
    return converted


def process_weight_svg_phase4(path: Path, *, flatness: float = 1.0) -> int:
    root = parse_svg_file(path)
    n = expand_strokes_in_tree(root, flatness=flatness)
    path.write_bytes(element_to_bytes(root))
    return n


def run_phase4(output_dir: Path, *, flatness: float = 1.0) -> dict[str, int]:
    """Same file selection as phase 3; stroke-expanded SVGs written in place."""
    output_dir = output_dir.resolve()
    results: dict[str, int] = {}
    for path in sorted(output_dir.glob("*.svg")):
        if path.name == "original.svg":
            continue
        if parse_weight_stem(path.stem) is None:
            continue
        n = process_weight_svg_phase4(path, flatness=flatness)
        results[path.stem] = n
    return results
