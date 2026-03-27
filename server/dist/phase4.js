/**
 * Stroke → filled outline via JSTS buffer (Shapely/GEOS analogue).
 */
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import SvgPath from "svgpath";
import BufferOp from "jsts/org/locationtech/jts/operation/buffer/BufferOp.js";
import BufferParameters from "jsts/org/locationtech/jts/operation/buffer/BufferParameters.js";
import Coordinate from "jsts/org/locationtech/jts/geom/Coordinate.js";
import GeometryFactory from "jsts/org/locationtech/jts/geom/GeometryFactory.js";
import GeometryCollection from "jsts/org/locationtech/jts/geom/GeometryCollection.js";
import UnaryUnionOp from "jsts/org/locationtech/jts/operation/union/UnaryUnionOp.js";
import { elementIsStroked, parseWeightStem } from "./phase3.js";
import { elementChildren, elementToBytes, localTag, parseSvgFile, SVG_NS, svgDocumentElement, } from "./xml.js";
const COORD_EPS = 1e-7;
const _NUM_RE = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;
const geomFact = new GeometryFactory();
function dist(x0, y0, x1, y1) {
    return Math.hypot(x1 - x0, y1 - y0);
}
function sampleCubic(x0, y0, x1, y1, x2, y2, x3, y3, flatness) {
    const ln = Math.max(1e-6, dist(x0, y0, x1, y1) + dist(x1, y1, x2, y2) + dist(x2, y2, x3, y3));
    const n = Math.max(4, Math.min(256, Math.floor(ln / flatness) + 1));
    const out = [];
    for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 0;
        const u = 1 - t;
        const x = u ** 3 * x0 + 3 * u ** 2 * t * x1 + 3 * u * t ** 2 * x2 + t ** 3 * x3;
        const y = u ** 3 * y0 + 3 * u ** 2 * t * y1 + 3 * u * t ** 2 * y2 + t ** 3 * y3;
        out.push([x, y]);
    }
    return out;
}
function sampleQuad(x0, y0, x1, y1, x2, y2, flatness) {
    const ln = Math.max(1e-6, dist(x0, y0, x1, y1) + dist(x1, y1, x2, y2));
    const n = Math.max(4, Math.min(256, Math.floor(ln / flatness) + 1));
    const out = [];
    for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 0;
        const u = 1 - t;
        const x = u * u * x0 + 2 * u * t * x1 + t * t * x2;
        const y = u * u * y0 + 2 * u * t * y1 + t * t * y2;
        out.push([x, y]);
    }
    return out;
}
function dedupeAppend(pts, x, y) {
    const last = pts[pts.length - 1];
    if (last && Math.abs(last[0] - x) < COORD_EPS && Math.abs(last[1] - y) < COORD_EPS) {
        return;
    }
    pts.push([x, y]);
}
function flattenPathToSubpaths(d, flatness) {
    if (!d || !d.trim())
        return [];
    let p;
    try {
        p = new SvgPath(d).abs().unshort().unarc();
    }
    catch {
        return [];
    }
    const segs = p.segments;
    const subpaths = [];
    let current = [];
    let closed = false;
    let cx = 0;
    let cy = 0;
    let subStart = [0, 0];
    const flush = () => {
        if (current.length >= 2) {
            subpaths.push({ coords: [...current], closed });
        }
        current = [];
        closed = false;
    };
    for (const s of segs) {
        const cmd = String(s[0]);
        if (cmd === "M" || cmd === "m") {
            flush();
            cx = Number(s[1]);
            cy = Number(s[2]);
            dedupeAppend(current, cx, cy);
            subStart = [cx, cy];
        }
        else if (cmd === "L" || cmd === "l") {
            cx = Number(s[s.length - 2]);
            cy = Number(s[s.length - 1]);
            dedupeAppend(current, cx, cy);
        }
        else if (cmd === "H" || cmd === "h") {
            cx = Number(s[1]);
            dedupeAppend(current, cx, cy);
        }
        else if (cmd === "V" || cmd === "v") {
            cy = Number(s[1]);
            dedupeAppend(current, cx, cy);
        }
        else if (cmd === "C" || cmd === "c") {
            const x1 = Number(s[1]);
            const y1 = Number(s[2]);
            const x2 = Number(s[3]);
            const y2 = Number(s[4]);
            const x = Number(s[5]);
            const y = Number(s[6]);
            const pts = sampleCubic(cx, cy, x1, y1, x2, y2, x, y, flatness);
            for (let i = 1; i < pts.length; i++) {
                dedupeAppend(current, pts[i][0], pts[i][1]);
            }
            cx = x;
            cy = y;
        }
        else if (cmd === "Q" || cmd === "q") {
            const x1 = Number(s[1]);
            const y1 = Number(s[2]);
            const x = Number(s[3]);
            const y = Number(s[4]);
            const pts = sampleQuad(cx, cy, x1, y1, x, y, flatness);
            for (let i = 1; i < pts.length; i++) {
                dedupeAppend(current, pts[i][0], pts[i][1]);
            }
            cx = x;
            cy = y;
        }
        else if (cmd === "Z" || cmd === "z") {
            closed = true;
            dedupeAppend(current, subStart[0], subStart[1]);
        }
    }
    flush();
    return subpaths;
}
function parsePointsAttr(raw) {
    if (!raw)
        return [];
    _NUM_RE.lastIndex = 0;
    const nums = [];
    let m;
    while ((m = _NUM_RE.exec(raw)) !== null) {
        nums.push(parseFloat(m[0]));
    }
    if (nums.length % 2 !== 0)
        return [];
    const out = [];
    for (let i = 0; i < nums.length; i += 2) {
        out.push([nums[i], nums[i + 1]]);
    }
    return out;
}
function parseStyle(style) {
    const out = {};
    for (const part of style.split(";")) {
        const p = part.trim();
        if (!p || !p.includes(":"))
            continue;
        const [k, ...rest] = p.split(":");
        out[k.trim().toLowerCase()] = rest.join(":").trim();
    }
    return out;
}
function hasDasharray(el) {
    const da = el.getAttribute("stroke-dasharray");
    if (da && da.trim() && da.trim().toLowerCase() !== "none")
        return true;
    const style = el.getAttribute("style");
    if (style) {
        const v = parseStyle(style)["stroke-dasharray"]?.trim() ?? "";
        if (v && v.toLowerCase() !== "none")
            return true;
    }
    return false;
}
function strokePaint(el) {
    const s = el.getAttribute("stroke");
    if (s && s.trim().toLowerCase() !== "none" && s.trim().toLowerCase() !== "transparent" && s.trim()) {
        return s.trim();
    }
    const style = el.getAttribute("style");
    if (style) {
        const st = parseStyle(style).stroke?.trim() ?? "";
        if (st && st.toLowerCase() !== "none" && st.toLowerCase() !== "transparent") {
            return st;
        }
    }
    return "#000000";
}
function strokeWidthPx(el) {
    const sw = el.getAttribute("stroke-width");
    if (sw) {
        return parseFloat(sw.replace(/px/gi, "").trim());
    }
    const style = el.getAttribute("style");
    if (style) {
        const w = parseStyle(style)["stroke-width"]?.replace(/px/gi, "").trim() ?? "";
        if (w)
            return parseFloat(w);
    }
    return 1;
}
function capStyle(el) {
    let raw = (el.getAttribute("stroke-linecap") || "").trim().toLowerCase();
    if (!raw) {
        const style = el.getAttribute("style");
        if (style)
            raw = parseStyle(style)["stroke-linecap"]?.trim().toLowerCase() ?? "";
    }
    if (raw === "round")
        return BufferParameters.CAP_ROUND;
    if (raw === "square")
        return BufferParameters.CAP_SQUARE;
    return BufferParameters.CAP_FLAT;
}
function joinStyle(el) {
    let raw = (el.getAttribute("stroke-linejoin") || "").trim().toLowerCase();
    if (!raw) {
        const style = el.getAttribute("style");
        if (style)
            raw = parseStyle(style)["stroke-linejoin"]?.trim().toLowerCase() ?? "";
    }
    if (raw === "round")
        return BufferParameters.JOIN_ROUND;
    if (raw === "bevel")
        return BufferParameters.JOIN_BEVEL;
    return BufferParameters.JOIN_MITRE;
}
function mitreLimit(el) {
    const raw = el.getAttribute("stroke-miterlimit");
    if (raw) {
        const v = parseFloat(raw);
        if (!Number.isNaN(v))
            return v;
    }
    const style = el.getAttribute("style");
    if (style) {
        const v = parseStyle(style)["stroke-miterlimit"]?.trim() ?? "";
        if (v) {
            const n = parseFloat(v);
            if (!Number.isNaN(n))
                return n;
        }
    }
    return 4.0;
}
function visibleFill(el) {
    const f = el.getAttribute("fill");
    if (f !== null) {
        const fl = f.trim().toLowerCase();
        if (fl === "none" || fl === "transparent" || fl === "")
            return false;
        return true;
    }
    const style = el.getAttribute("style");
    if (style) {
        const fl = parseStyle(style).fill?.trim().toLowerCase() ?? "";
        if (fl === "none" || fl === "transparent")
            return false;
        if (fl)
            return true;
    }
    return false;
}
function stripStrokePresentation(el) {
    for (const k of [
        "stroke",
        "stroke-width",
        "stroke-linecap",
        "stroke-linejoin",
        "stroke-miterlimit",
        "stroke-dasharray",
        "stroke-dashoffset",
        "stroke-opacity",
    ]) {
        el.removeAttribute(k);
    }
    const style = el.getAttribute("style");
    if (!style)
        return;
    const sd = parseStyle(style);
    for (const key of Object.keys(sd)) {
        if (key.startsWith("stroke"))
            delete sd[key];
    }
    const keys = Object.keys(sd);
    if (keys.length) {
        el.setAttribute("style", keys.map((k) => `${k}:${sd[k]}`).join(";"));
    }
    else {
        el.removeAttribute("style");
    }
}
function ringToD(coords) {
    if (coords.length < 2)
        return "";
    let c = [...coords];
    const last = c[c.length - 1];
    const first = c[0];
    if (c.length >= 2 &&
        Math.abs(first[0] - last[0]) < COORD_EPS &&
        Math.abs(first[1] - last[1]) < COORD_EPS) {
        c = c.slice(0, -1);
    }
    if (c.length < 2)
        return "";
    const parts = [`M ${c[0][0].toPrecision(6)},${c[0][1].toPrecision(6)}`];
    for (let i = 1; i < c.length; i++) {
        parts.push(`L ${c[i][0].toPrecision(6)},${c[i][1].toPrecision(6)}`);
    }
    parts.push("Z");
    return parts.join(" ");
}
function polygonToPathD(poly) {
    const shell = poly.getExteriorRing();
    const coords = shell.getCoordinates();
    const exterior = [];
    for (let i = 0; i < coords.length - 1; i++) {
        exterior.push([coords[i].x, coords[i].y]);
    }
    const parts = [];
    const rd = ringToD(exterior);
    if (rd)
        parts.push(rd);
    let needsEvenodd = false;
    for (let hi = 0; hi < poly.getNumInteriorRing(); hi++) {
        const hole = poly.getInteriorRingN(hi);
        const hc = hole.getCoordinates();
        const hpts = [];
        for (let i = 0; i < hc.length - 1; i++) {
            hpts.push([hc[i].x, hc[i].y]);
        }
        const hd = ringToD(hpts);
        if (hd)
            parts.push(hd);
        needsEvenodd = true;
    }
    const d = parts.filter(Boolean).join(" ").trim();
    return { d, evenodd: needsEvenodd };
}
function geometryToPathD(geom) {
    const g = geom;
    if (g.isEmpty())
        return { d: "", evenodd: false };
    const gt = g.getGeometryType();
    if (gt === "Polygon") {
        return polygonToPathD(geom);
    }
    if (gt === "MultiPolygon") {
        const mp = geom;
        const chunks = [];
        let needs = false;
        for (let i = 0; i < mp.getNumGeometries(); i++) {
            const { d, evenodd } = polygonToPathD(mp.getGeometryN(i));
            if (d)
                chunks.push(d);
            needs = needs || evenodd;
        }
        return {
            d: chunks.join(" ").trim(),
            evenodd: needs || mp.getNumGeometries() > 1,
        };
    }
    if (gt === "Point")
        return { d: "", evenodd: false };
    if (geom instanceof GeometryCollection) {
        const polys = [];
        for (let i = 0; i < g.getNumGeometries(); i++) {
            const gi = g.getGeometryN(i);
            if (gi.getGeometryType() === "Polygon")
                polys.push(gi);
        }
        if (!polys.length)
            return { d: "", evenodd: false };
        if (polys.length === 1)
            return polygonToPathD(polys[0]);
        const mp = geomFact.createMultiPolygon(polys);
        return geometryToPathD(mp);
    }
    return { d: "", evenodd: false };
}
function coordsToLinearRing(coords) {
    return coords.map(([x, y]) => new Coordinate(x, y));
}
function bufferSubpaths(subpaths, halfW, cap, join, mitre, quadSegs) {
    const bp = new BufferParameters();
    bp.setQuadrantSegments(quadSegs);
    bp.setEndCapStyle(cap);
    bp.setJoinStyle(join);
    bp.setMitreLimit(mitre);
    const geoms = [];
    for (const { coords, closed } of subpaths) {
        if (coords.length < 2)
            continue;
        try {
            if (closed && coords.length >= 3) {
                let c = coordsToLinearRing(coords);
                const first = c[0];
                const last = c[c.length - 1];
                if (Math.abs(first.x - last.x) > COORD_EPS ||
                    Math.abs(first.y - last.y) > COORD_EPS) {
                    c = [...c, new Coordinate(first.x, first.y)];
                }
                const ring = geomFact.createLinearRing(c);
                const bufOp = new BufferOp(ring, bp);
                const g = bufOp.getResultGeometry(halfW);
                if (!g.isEmpty())
                    geoms.push(g);
            }
            else {
                const line = geomFact.createLineString(coordsToLinearRing(coords));
                const bufOp = new BufferOp(line, bp);
                const g = bufOp.getResultGeometry(halfW);
                if (!g.isEmpty())
                    geoms.push(g);
            }
        }
        catch {
            continue;
        }
    }
    if (!geoms.length)
        return null;
    if (geoms.length === 1)
        return geoms[0];
    const gc = geomFact.createGeometryCollection(geoms);
    return UnaryUnionOp.union(gc) ?? null;
}
function outlineFromSubpaths(subpaths, el, flatness) {
    const sw = strokeWidthPx(el);
    if (sw <= 0)
        return null;
    const half = sw / 2;
    const cap = capStyle(el);
    const join = joinStyle(el);
    const mitre = mitreLimit(el);
    const g = bufferSubpaths(subpaths, half, cap, join, mitre, 8);
    if (!g)
        return null;
    return geometryToPathD(g);
}
function insertAfter(parent, reference, newEl) {
    const kids = elementChildren(parent);
    const idx = kids.indexOf(reference);
    const next = idx >= 0 && idx + 1 < kids.length ? kids[idx + 1] : null;
    if (next) {
        parent.insertBefore(newEl, next);
    }
    else {
        parent.appendChild(newEl);
    }
}
function convertPathElement(el, parent, flatness, doc) {
    if (!elementIsStroked(el) || hasDasharray(el))
        return false;
    const d = el.getAttribute("d");
    if (!d)
        return false;
    const subpaths = flattenPathToSubpaths(d, flatness);
    if (!subpaths.length)
        return false;
    const out = outlineFromSubpaths(subpaths, el, flatness);
    if (!out || !out.d)
        return false;
    const { d: pathD, evenodd } = out;
    const paint = strokePaint(el);
    const hasFill = visibleFill(el);
    if (hasFill) {
        const outline = doc.createElementNS(SVG_NS, "path");
        outline.setAttribute("d", pathD);
        outline.setAttribute("fill", paint);
        if (evenodd)
            outline.setAttribute("fill-rule", "evenodd");
        insertAfter(parent, el, outline);
        stripStrokePresentation(el);
    }
    else {
        el.setAttribute("d", pathD);
        el.setAttribute("fill", paint);
        if (evenodd)
            el.setAttribute("fill-rule", "evenodd");
        stripStrokePresentation(el);
    }
    return true;
}
function lineSubpaths(el) {
    try {
        const x1 = parseFloat(el.getAttribute("x1") || "0");
        const y1 = parseFloat(el.getAttribute("y1") || "0");
        const x2 = parseFloat(el.getAttribute("x2") || "0");
        const y2 = parseFloat(el.getAttribute("y2") || "0");
        return [{ coords: [[x1, y1], [x2, y2]], closed: false }];
    }
    catch {
        return [];
    }
}
function polylineSubpaths(el) {
    const pts = parsePointsAttr(el.getAttribute("points"));
    if (pts.length < 2)
        return [];
    return [{ coords: pts, closed: false }];
}
function polygonSubpaths(el) {
    const pts = parsePointsAttr(el.getAttribute("points"));
    if (pts.length < 3)
        return [];
    return [{ coords: pts, closed: true }];
}
function replaceWithPath(parent, el, d, evenodd, doc) {
    const newEl = doc.createElementNS(SVG_NS, "path");
    newEl.setAttribute("d", d);
    if (evenodd)
        newEl.setAttribute("fill-rule", "evenodd");
    parent.replaceChild(newEl, el);
    return newEl;
}
function convertLineLikeElementSimple(el, parent, tag, flatness, doc) {
    if (!elementIsStroked(el) || hasDasharray(el))
        return false;
    if (visibleFill(el))
        return false;
    let subpaths;
    if (tag === "line")
        subpaths = lineSubpaths(el);
    else if (tag === "polyline")
        subpaths = polylineSubpaths(el);
    else if (tag === "polygon")
        subpaths = polygonSubpaths(el);
    else
        return false;
    const out = outlineFromSubpaths(subpaths, el, flatness);
    if (!out || !out.d)
        return false;
    const newEl = replaceWithPath(parent, el, out.d, out.evenodd, doc);
    newEl.setAttribute("fill", strokePaint(el));
    return true;
}
function parentMap(root) {
    const m = new Map();
    const walk = (el) => {
        for (const c of elementChildren(el)) {
            m.set(c, el);
            walk(c);
        }
    };
    walk(root);
    return m;
}
function collectElements(root) {
    const all = [];
    const walk = (el) => {
        all.push(el);
        for (const c of elementChildren(el))
            walk(c);
    };
    walk(root);
    return all;
}
export function expandStrokesInTree(root, flatness = 1) {
    const doc = root.ownerDocument;
    if (!doc)
        throw new Error("expandStrokesInTree: missing ownerDocument");
    let converted = 0;
    let changed = true;
    while (changed) {
        changed = false;
        const pmap = parentMap(root);
        for (const el of collectElements(root)) {
            const tag = localTag(el);
            const parent = pmap.get(el);
            if (parent === undefined)
                continue;
            if (tag === "path") {
                if (convertPathElement(el, parent, flatness, doc)) {
                    converted++;
                    changed = true;
                }
            }
            else if (tag === "line") {
                if (convertLineLikeElementSimple(el, parent, tag, flatness, doc)) {
                    converted++;
                    changed = true;
                }
            }
            else if (tag === "polyline") {
                if (convertLineLikeElementSimple(el, parent, tag, flatness, doc)) {
                    converted++;
                    changed = true;
                }
            }
            else if (tag === "polygon") {
                if (convertLineLikeElementSimple(el, parent, tag, flatness, doc)) {
                    converted++;
                    changed = true;
                }
            }
        }
    }
    return converted;
}
function processWeightSvgPhase4(path, flatness) {
    const doc = parseSvgFile(path);
    const svgRoot = svgDocumentElement(doc);
    const n = expandStrokesInTree(svgRoot, flatness);
    writeFileSync(path, elementToBytes(svgRoot));
    return n;
}
export function runPhase4(outputDir, flatness = 1) {
    const dir = String(outputDir);
    const results = {};
    for (const name of readdirSync(dir).filter((f) => f.endsWith(".svg")).sort()) {
        if (name === "original.svg")
            continue;
        const stem = name.replace(/\.svg$/i, "");
        if (!parseWeightStem(stem))
            continue;
        const full = join(dir, name);
        results[stem] = processWeightSvgPhase4(full, flatness);
    }
    return results;
}
