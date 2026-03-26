/**
 * Bake 2D affine transforms into SVG geometry (same math as Python svg_affine_bake.py).
 */
import SvgPath from "svgpath";
import { elementChildren, localTag } from "./xml.js";
const _NUM_RE = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;
const _TRANSFORM_CALL_RE = /(matrix|translate|scale|rotate)\s*\(([^)]*)\)/gi;
export function matIdentity() {
    return [1, 0, 0, 0, 1, 0];
}
export function matMul(m1, m2) {
    const [a1, c1, e1, b1, d1, f1] = m1;
    const [a2, c2, e2, b2, d2, f2] = m2;
    return [
        a1 * a2 + c1 * b2,
        a1 * c2 + c1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * a2 + d1 * b2,
        b1 * c2 + d1 * d2,
        b1 * e2 + d1 * f2 + f1,
    ];
}
export function matTranslate(tx, ty) {
    return [1, 0, tx, 0, 1, ty];
}
export function matScale(sx, sy) {
    return [sx, 0, 0, 0, sy, 0];
}
export function matRotateDeg(angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    const cosT = Math.cos(rad);
    const sinT = Math.sin(rad);
    return [cosT, -sinT, 0, sinT, cosT, 0];
}
export function applyAffinePt(x, y, m) {
    const [a, c, e, b, d, f] = m;
    return [a * x + c * y + e, b * x + d * y + f];
}
export function applyAffineZ(zre, zim, m) {
    return applyAffinePt(zre, zim, m);
}
export function buildPhase1BakeMatrix(s, ox, oy, tx, ty) {
    return matMul(matTranslate(tx, ty), matMul(matScale(s, s), matTranslate(-ox, -oy)));
}
function floats(s) {
    _NUM_RE.lastIndex = 0;
    const out = [];
    let m;
    while ((m = _NUM_RE.exec(s)) !== null) {
        out.push(parseFloat(m[0]));
    }
    return out;
}
function parseMatrix(args) {
    const nums = floats(args);
    if (nums.length !== 6)
        throw new Error(`matrix() expects 6 numbers, got ${args}`);
    const [a, b, c, d, e, f] = nums;
    return [a, c, e, b, d, f];
}
function parseTranslate(args) {
    const nums = floats(args);
    if (nums.length === 1)
        return matTranslate(nums[0], 0);
    if (nums.length === 2)
        return matTranslate(nums[0], nums[1]);
    throw new Error(`translate() expects 1 or 2 numbers, got ${args}`);
}
function parseScale(args) {
    const nums = floats(args);
    if (nums.length === 1)
        return matScale(nums[0], nums[0]);
    if (nums.length === 2)
        return matScale(nums[0], nums[1]);
    throw new Error(`scale() expects 1 or 2 numbers, got ${args}`);
}
function parseRotate(args) {
    const nums = floats(args);
    if (nums.length === 1)
        return matRotateDeg(nums[0]);
    if (nums.length === 3) {
        const cx = nums[1];
        const cy = nums[2];
        return matMul(matMul(matTranslate(cx, cy), matRotateDeg(nums[0])), matTranslate(-cx, -cy));
    }
    throw new Error(`rotate() expects 1 or 3 numbers, got ${args}`);
}
export function parseTransformAttr(raw) {
    if (!raw || !raw.trim())
        return matIdentity();
    let m = matIdentity();
    const calls = [...raw.matchAll(_TRANSFORM_CALL_RE)];
    if (calls.length === 0)
        return matIdentity();
    for (let i = calls.length - 1; i >= 0; i--) {
        const match = calls[i];
        const name = match[1].toLowerCase();
        const args = match[2];
        let part;
        if (name === "matrix")
            part = parseMatrix(args);
        else if (name === "translate")
            part = parseTranslate(args);
        else if (name === "scale")
            part = parseScale(args);
        else if (name === "rotate")
            part = parseRotate(args);
        else
            continue;
        m = matMul(part, m);
    }
    return m;
}
/** SVG matrix [a,b,c,d,e,f] for svgpath.matrix() */
function affineToSvgMatrix(m) {
    const [a, c, e, b, d, f] = m;
    return [a, b, c, d, e, f];
}
export function bakePathD(d, m) {
    if (!d || !d.trim())
        return d;
    try {
        const mat = affineToSvgMatrix(m);
        return new SvgPath(d).matrix(mat).round(6).toString();
    }
    catch (e) {
        throw new Error(`Unparseable path d=${JSON.stringify(d)}`, { cause: e });
    }
}
function parsePointsAttr(raw) {
    if (!raw)
        return [];
    const nums = floats(raw);
    if (nums.length % 2 !== 0)
        return [];
    const out = [];
    for (let i = 0; i < nums.length; i += 2) {
        out.push([nums[i], nums[i + 1]]);
    }
    return out;
}
function formatPoints(pts) {
    return pts.map(([x, y]) => `${x},${y}`).join(" ");
}
const _BAKE_TAGS = new Set([
    "path",
    "line",
    "polyline",
    "polygon",
    "rect",
    "circle",
    "ellipse",
]);
export function bakeBasicShape(el, m) {
    const tag = localTag(el);
    if (tag === "path") {
        const d = el.getAttribute("d");
        if (d)
            el.setAttribute("d", bakePathD(d, m));
        return;
    }
    if (tag === "line") {
        const x1 = parseFloat(el.getAttribute("x1") || "0");
        const y1 = parseFloat(el.getAttribute("y1") || "0");
        const x2 = parseFloat(el.getAttribute("x2") || "0");
        const y2 = parseFloat(el.getAttribute("y2") || "0");
        const [nx1, ny1] = applyAffinePt(x1, y1, m);
        const [nx2, ny2] = applyAffinePt(x2, y2, m);
        el.setAttribute("x1", String(nx1));
        el.setAttribute("y1", String(ny1));
        el.setAttribute("x2", String(nx2));
        el.setAttribute("y2", String(ny2));
        return;
    }
    if (tag === "polyline" || tag === "polygon") {
        const pts = parsePointsAttr(el.getAttribute("points"));
        if (pts.length) {
            const baked = pts.map(([x, y]) => applyAffinePt(x, y, m));
            el.setAttribute("points", formatPoints(baked));
        }
        return;
    }
    if (tag === "rect") {
        const x = parseFloat(el.getAttribute("x") || "0");
        const y = parseFloat(el.getAttribute("y") || "0");
        const w = parseFloat(el.getAttribute("width") || "0");
        const h = parseFloat(el.getAttribute("height") || "0");
        const corners = [
            [x, y],
            [x + w, y],
            [x + w, y + h],
            [x, y + h],
        ];
        const baked = corners.map(([px, py]) => applyAffinePt(px, py, m));
        const xs = baked.map((p) => p[0]);
        const ys = baked.map((p) => p[1]);
        const nx = Math.min(...xs);
        const ny = Math.min(...ys);
        const nw = Math.max(...xs) - nx;
        const nh = Math.max(...ys) - ny;
        el.setAttribute("x", String(nx));
        el.setAttribute("y", String(ny));
        el.setAttribute("width", String(nw));
        el.setAttribute("height", String(nh));
        if (el.hasAttribute("rx")) {
            const rx = parseFloat(el.getAttribute("rx") || "0");
            const scx = w ? nw / w : 1;
            el.setAttribute("rx", String(rx * scx));
        }
        if (el.hasAttribute("ry")) {
            const ry = parseFloat(el.getAttribute("ry") || "0");
            const scy = h ? nh / h : 1;
            el.setAttribute("ry", String(ry * scy));
        }
        return;
    }
    if (tag === "circle") {
        const cx = parseFloat(el.getAttribute("cx") || "0");
        const cy = parseFloat(el.getAttribute("cy") || "0");
        const r = parseFloat(el.getAttribute("r") || "0");
        const c0 = applyAffineZ(cx, cy, m);
        const rEdge = applyAffineZ(cx + r, cy, m);
        const nr = Math.hypot(rEdge[0] - c0[0], rEdge[1] - c0[1]);
        el.setAttribute("cx", String(c0[0]));
        el.setAttribute("cy", String(c0[1]));
        el.setAttribute("r", String(nr));
        return;
    }
    if (tag === "ellipse") {
        const cx = parseFloat(el.getAttribute("cx") || "0");
        const cy = parseFloat(el.getAttribute("cy") || "0");
        const rx = parseFloat(el.getAttribute("rx") || "0");
        const ry = parseFloat(el.getAttribute("ry") || "0");
        const c0 = applyAffineZ(cx, cy, m);
        const ex = applyAffineZ(cx + rx, cy, m);
        const ey = applyAffineZ(cx, cy + ry, m);
        el.setAttribute("cx", String(c0[0]));
        el.setAttribute("cy", String(c0[1]));
        el.setAttribute("rx", String(Math.hypot(ex[0] - c0[0], ex[1] - c0[1])));
        el.setAttribute("ry", String(Math.hypot(ey[0] - c0[0], ey[1] - c0[1])));
    }
}
export function bakeVisualSubtree(el, mAccum) {
    const tag = localTag(el);
    if (tag === "g") {
        const mLocal = parseTransformAttr(el.getAttribute("transform"));
        const mNext = matMul(mAccum, mLocal);
        el.removeAttribute("transform");
        for (const child of elementChildren(el)) {
            bakeVisualSubtree(child, mNext);
        }
        return;
    }
    if (_BAKE_TAGS.has(tag)) {
        bakeBasicShape(el, mAccum);
        return;
    }
    for (const child of elementChildren(el)) {
        bakeVisualSubtree(child, mAccum);
    }
}
