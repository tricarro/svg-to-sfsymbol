"""
Bake 2D affine transforms into SVG geometry so stroke-width is not scaled by a
parent ``transform="scale(...)"`` group.
"""

from __future__ import annotations

import math
import re
from typing import List, Tuple, Union

from svg.path import Arc, Close, CubicBezier, Line, Move, Path, QuadraticBezier, parse_path
from xml.etree import ElementTree as ET


def _local_tag(tag: str) -> str:
    if tag.startswith("{"):
        return tag.split("}", 1)[1]
    return tag

# x' = a*x + c*y + e ; y' = b*x + d*y + f  (SVG matrix column convention)
Affine = Tuple[float, float, float, float, float, float]

_NUM_RE = re.compile(r"[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?")
_TRANSFORM_CALL_RE = re.compile(
    r"(matrix|translate|scale|rotate)\s*\(([^)]*)\)", re.IGNORECASE
)


def mat_identity() -> Affine:
    return (1.0, 0.0, 0.0, 0.0, 1.0, 0.0)


def mat_mul(m1: Affine, m2: Affine) -> Affine:
    a1, c1, e1, b1, d1, f1 = m1
    a2, c2, e2, b2, d2, f2 = m2
    return (
        a1 * a2 + c1 * b2,
        a1 * c2 + c1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * a2 + d1 * b2,
        b1 * c2 + d1 * d2,
        b1 * e2 + d1 * f2 + f1,
    )


def mat_translate(tx: float, ty: float) -> Affine:
    return (1.0, 0.0, tx, 0.0, 1.0, ty)


def mat_scale(sx: float, sy: float) -> Affine:
    return (sx, 0.0, 0.0, 0.0, sy, 0.0)


def mat_rotate_deg(angle_deg: float) -> Affine:
    rad = math.radians(angle_deg)
    cos_t, sin_t = math.cos(rad), math.sin(rad)
    return (cos_t, -sin_t, 0.0, sin_t, cos_t, 0.0)


def apply_affine_pt(x: float, y: float, m: Affine) -> Tuple[float, float]:
    a, c, e, b, d, f = m
    return (a * x + c * y + e, b * x + d * y + f)


def apply_affine_z(z: complex, m: Affine) -> complex:
    x, y = apply_affine_pt(z.real, z.imag, m)
    return complex(x, y)


def build_phase1_bake_matrix(
    s: float, ox: float, oy: float, tx: float, ty: float
) -> Affine:
    """Same mapping as former ``translate(tx,ty) scale(s) translate(-ox,-oy)``."""
    return mat_mul(
        mat_translate(tx, ty),
        mat_mul(mat_scale(s, s), mat_translate(-ox, -oy)),
    )


def _floats(s: str) -> List[float]:
    return [float(x) for x in _NUM_RE.findall(s)]


def _parse_matrix(args: str) -> Affine:
    nums = _floats(args)
    if len(nums) != 6:
        raise ValueError(f"matrix() expects 6 numbers, got {args!r}")
    a, b, c, d, e, f = nums
    return (a, c, e, b, d, f)


def _parse_translate(args: str) -> Affine:
    nums = _floats(args)
    if len(nums) == 1:
        return mat_translate(nums[0], 0.0)
    if len(nums) == 2:
        return mat_translate(nums[0], nums[1])
    raise ValueError(f"translate() expects 1 or 2 numbers, got {args!r}")


def _parse_scale(args: str) -> Affine:
    nums = _floats(args)
    if len(nums) == 1:
        return mat_scale(nums[0], nums[0])
    if len(nums) == 2:
        return mat_scale(nums[0], nums[1])
    raise ValueError(f"scale() expects 1 or 2 numbers, got {args!r}")


def _parse_rotate(args: str) -> Affine:
    nums = _floats(args)
    if len(nums) == 1:
        return mat_rotate_deg(nums[0])
    if len(nums) == 3:
        cx, cy = nums[1], nums[2]
        return mat_mul(
            mat_mul(mat_translate(cx, cy), mat_rotate_deg(nums[0])),
            mat_translate(-cx, -cy),
        )
    raise ValueError(f"rotate() expects 1 or 3 numbers, got {args!r}")


def parse_transform_attr(raw: str | None) -> Affine:
    """Parse SVG ``transform`` attribute into a single affine matrix."""
    if not raw or not raw.strip():
        return mat_identity()
    m = mat_identity()
    calls = list(_TRANSFORM_CALL_RE.finditer(raw))
    if not calls:
        return mat_identity()
    for match in reversed(calls):
        name, args = match.group(1).lower(), match.group(2)
        if name == "matrix":
            part = _parse_matrix(args)
        elif name == "translate":
            part = _parse_translate(args)
        elif name == "scale":
            part = _parse_scale(args)
        elif name == "rotate":
            part = _parse_rotate(args)
        else:
            continue
        m = mat_mul(part, m)
    return m


def is_uniform_scale_translate(m: Affine, eps: float = 1e-9) -> bool:
    a, c, e, b, d, f = m
    return abs(b) < eps and abs(c) < eps and abs(a - d) < eps


def _uniform_scale(m: Affine) -> float:
    return m[0]


def _arc_to_lines(arc: Arc, m: Affine, segments: int = 32) -> List[Line]:
    pts = [apply_affine_z(arc.point(i / segments), m) for i in range(segments + 1)]
    return [
        Line(pts[i], pts[i + 1], relative=False) for i in range(len(pts) - 1)
    ]


PathSegment = Union[Move, Line, CubicBezier, QuadraticBezier, Arc, Close]


def _transform_segment(
    seg: object, m: Affine
) -> Union[PathSegment, List[Line]]:
    if isinstance(seg, Move):
        return Move(apply_affine_z(seg.end, m), relative=False)
    if isinstance(seg, Line):
        return Line(
            apply_affine_z(seg.start, m),
            apply_affine_z(seg.end, m),
            relative=False,
        )
    if isinstance(seg, CubicBezier):
        return CubicBezier(
            apply_affine_z(seg.start, m),
            apply_affine_z(seg.control1, m),
            apply_affine_z(seg.control2, m),
            apply_affine_z(seg.end, m),
            relative=False,
        )
    if isinstance(seg, QuadraticBezier):
        return QuadraticBezier(
            apply_affine_z(seg.start, m),
            apply_affine_z(seg.control, m),
            apply_affine_z(seg.end, m),
            relative=False,
        )
    if isinstance(seg, Arc):
        if is_uniform_scale_translate(m):
            sc = _uniform_scale(m)
            return Arc(
                apply_affine_z(seg.start, m),
                complex(abs(sc) * seg.radius.real, abs(sc) * seg.radius.imag),
                seg.rotation,
                seg.arc,
                seg.sweep,
                apply_affine_z(seg.end, m),
                relative=False,
            )
        return _arc_to_lines(seg, m)
    if isinstance(seg, Close):
        return Close(
            apply_affine_z(seg.start, m),
            apply_affine_z(seg.end, m),
            relative=False,
        )
    raise TypeError(f"Unsupported path segment: {type(seg)!r}")


def bake_path_d(d: str, m: Affine) -> str:
    if not d or not d.strip():
        return d
    try:
        src = parse_path(d)
    except Exception as e:
        raise ValueError(f"Unparseable path d={d!r}") from e
    out: List[PathSegment] = []
    for seg in src:
        t = _transform_segment(seg, m)
        if isinstance(t, list):
            out.extend(t)
        else:
            out.append(t)
    return Path(*out).d()


def _parse_points_attr(raw: str | None) -> List[Tuple[float, float]]:
    if not raw:
        return []
    nums = _floats(raw)
    if len(nums) % 2 != 0:
        return []
    return [(nums[i], nums[i + 1]) for i in range(0, len(nums), 2)]


def _format_points(pts: List[Tuple[float, float]]) -> str:
    return " ".join(f"{x},{y}" for x, y in pts)


def bake_basic_shape(el: ET.Element, m: Affine) -> None:
    tag = _local_tag(el.tag)
    if tag == "path":
        d = el.get("d")
        if d:
            el.set("d", bake_path_d(d, m))
        return
    if tag == "line":
        x1, y1 = float(el.get("x1", 0)), float(el.get("y1", 0))
        x2, y2 = float(el.get("x2", 0)), float(el.get("y2", 0))
        nx1, ny1 = apply_affine_pt(x1, y1, m)
        nx2, ny2 = apply_affine_pt(x2, y2, m)
        el.set("x1", str(nx1))
        el.set("y1", str(ny1))
        el.set("x2", str(nx2))
        el.set("y2", str(ny2))
        return
    if tag in ("polyline", "polygon"):
        pts = _parse_points_attr(el.get("points"))
        if pts:
            baked = [apply_affine_pt(x, y, m) for x, y in pts]
            el.set("points", _format_points(baked))
        return
    if tag == "rect":
        x, y = float(el.get("x", 0)), float(el.get("y", 0))
        w, h = float(el.get("width", 0)), float(el.get("height", 0))
        corners = [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
        baked = [apply_affine_pt(px, py, m) for px, py in corners]
        xs = [p[0] for p in baked]
        ys = [p[1] for p in baked]
        nx, ny, nw, nh = min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)
        el.set("x", str(nx))
        el.set("y", str(ny))
        el.set("width", str(nw))
        el.set("height", str(nh))
        if el.get("rx") is not None:
            rx = float(el.get("rx", 0))
            scx = nw / w if w else 1.0
            el.set("rx", str(rx * scx))
        if el.get("ry") is not None:
            ry = float(el.get("ry", 0))
            scy = nh / h if h else 1.0
            el.set("ry", str(ry * scy))
        return
    if tag == "circle":
        cx, cy = float(el.get("cx", 0)), float(el.get("cy", 0))
        r = float(el.get("r", 0))
        c0 = apply_affine_z(complex(cx, cy), m)
        r_edge = apply_affine_z(complex(cx + r, cy), m)
        nr = abs(r_edge - c0)
        el.set("cx", str(c0.real))
        el.set("cy", str(c0.imag))
        el.set("r", str(nr))
        return
    if tag == "ellipse":
        cx, cy = float(el.get("cx", 0)), float(el.get("cy", 0))
        rx, ry = float(el.get("rx", 0)), float(el.get("ry", 0))
        c0 = apply_affine_z(complex(cx, cy), m)
        ex = apply_affine_z(complex(cx + rx, cy), m)
        ey = apply_affine_z(complex(cx, cy + ry), m)
        el.set("cx", str(c0.real))
        el.set("cy", str(c0.imag))
        el.set("rx", str(abs(ex - c0)))
        el.set("ry", str(abs(ey - c0)))
        return


_BAKE_TAGS = frozenset(
    {
        "path",
        "line",
        "polyline",
        "polygon",
        "rect",
        "circle",
        "ellipse",
    }
)


def bake_visual_subtree(el: ET.Element, m_accum: Affine) -> None:
    """Apply *m_accum* to geometry under *el*; strip baked ``<g>`` transforms."""
    tag = _local_tag(el.tag)
    if tag == "g":
        m_local = parse_transform_attr(el.get("transform"))
        m_next = mat_mul(m_accum, m_local)
        if "transform" in el.attrib:
            del el.attrib["transform"]
        for child in list(el):
            bake_visual_subtree(child, m_next)
        return
    if tag in _BAKE_TAGS:
        bake_basic_shape(el, m_accum)
        return
    for child in list(el):
        bake_visual_subtree(child, m_accum)
