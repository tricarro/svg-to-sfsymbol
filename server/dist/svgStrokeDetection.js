/**
 * Classify upload SVG as stroked-input vs filled-input for routing.
 * Heuristic only: ignores <use>, complex CSS, inherited display, etc.
 */
import { elementChildren, localTag, parseSvgXml, svgDocumentElement, } from "./xml.js";
const GRAPHICAL_TAGS = new Set([
    "path",
    "line",
    "polyline",
    "polygon",
    "rect",
    "circle",
    "ellipse",
    "text",
]);
function parseInlineStyle(style) {
    const m = new Map();
    if (!style)
        return m;
    for (const part of style.split(";")) {
        const idx = part.indexOf(":");
        if (idx === -1)
            continue;
        const k = part.slice(0, idx).trim().toLowerCase();
        const v = part.slice(idx + 1).trim();
        if (k)
            m.set(k, v);
    }
    return m;
}
function strokeColorFromElement(el) {
    const a = el.getAttribute("stroke");
    if (a !== null && a.trim() !== "")
        return a.trim();
    const st = parseInlineStyle(el.getAttribute("style"));
    const v = st.get("stroke");
    return v !== undefined && v.trim() !== "" ? v.trim() : null;
}
function strokeWidthFromElement(el) {
    const a = el.getAttribute("stroke-width");
    if (a !== null && a.trim() !== "") {
        const n = parseFloat(a);
        return Number.isNaN(n) ? null : n;
    }
    const st = parseInlineStyle(el.getAttribute("style"));
    const w = st.get("stroke-width");
    if (w === undefined || w.trim() === "")
        return null;
    const n = parseFloat(w);
    return Number.isNaN(n) ? null : n;
}
function isNoneOrTransparent(color) {
    const c = color.trim().toLowerCase().replace(/\s+/g, "");
    return c === "none" || c === "transparent";
}
/**
 * True if this element paints a visible stroke per presentation attrs / inline style only.
 */
export function elementHasVisibleStroke(el) {
    const color = strokeColorFromElement(el);
    if (color === null)
        return false;
    if (isNoneOrTransparent(color))
        return false;
    const w = strokeWidthFromElement(el);
    if (w !== null && w <= 0)
        return false;
    return true;
}
function walk(el, inDefs) {
    const tag = localTag(el);
    if (tag === "defs") {
        for (const c of elementChildren(el)) {
            const r = walk(c, true);
            if (r)
                return r;
        }
        return null;
    }
    if (inDefs) {
        for (const c of elementChildren(el)) {
            const r = walk(c, true);
            if (r)
                return r;
        }
        return null;
    }
    if (GRAPHICAL_TAGS.has(tag) && elementHasVisibleStroke(el)) {
        return "stroked";
    }
    for (const c of elementChildren(el)) {
        const r = walk(c, false);
        if (r)
            return r;
    }
    return null;
}
/**
 * Parse SVG XML and return "stroked" if any graphical element has a visible stroke;
 * otherwise "filled" (fill-only / no stroke artwork).
 */
export function classifySvgStrokedOrFilled(xml) {
    const doc = parseSvgXml(xml);
    const root = svgDocumentElement(doc);
    return walk(root, false) ?? "filled";
}
export function elementHasVisibleFill(el) {
    const f = el.getAttribute("fill");
    if (f !== null) {
        const fl = f.trim().toLowerCase();
        if (fl === "none" || fl === "transparent" || fl === "")
            return false;
        return true;
    }
    const st = parseInlineStyle(el.getAttribute("style"));
    const fl = st.get("fill")?.trim().toLowerCase() ?? "";
    if (fl === "none" || fl === "transparent")
        return false;
    if (fl)
        return true;
    return false;
}
/**
 * Max stroke-width among visibly stroked graphical elements (missing width counts as 1),
 * and stroke color from the first such element in document order. Used when preprocessing
 * mixed icons before the square pipeline.
 */
export function representativeStrokeStyleForMixedPreprocess(root) {
    let maxW = 0;
    let firstColor = null;
    const scan = (el, inDefs) => {
        const tag = localTag(el);
        if (tag === "defs") {
            for (const c of elementChildren(el))
                scan(c, true);
            return;
        }
        if (inDefs) {
            for (const c of elementChildren(el))
                scan(c, true);
            return;
        }
        if (GRAPHICAL_TAGS.has(tag) && elementHasVisibleStroke(el)) {
            const w = strokeWidthFromElement(el) ?? 1;
            if (w > maxW)
                maxW = w;
            if (firstColor === null) {
                const c = strokeColorFromElement(el);
                if (c && !isNoneOrTransparent(c))
                    firstColor = c;
            }
        }
        for (const c of elementChildren(el))
            scan(c, false);
    };
    scan(root, false);
    return {
        width: maxW > 0 ? maxW : 1,
        color: firstColor ?? "#000000",
    };
}
/**
 * Route uploads: fill-only, stroke-only, or both (mixed → square pipeline after fill-to-stroke preprocess).
 */
export function classifySvgRouting(xml) {
    const doc = parseSvgXml(xml);
    const root = svgDocumentElement(doc);
    let anyStroke = false;
    let anyFill = false;
    const scan = (el, inDefs) => {
        const tag = localTag(el);
        if (tag === "defs") {
            for (const c of elementChildren(el))
                scan(c, true);
            return;
        }
        if (inDefs) {
            for (const c of elementChildren(el))
                scan(c, true);
            return;
        }
        if (GRAPHICAL_TAGS.has(tag)) {
            if (elementHasVisibleStroke(el))
                anyStroke = true;
            if (elementHasVisibleFill(el))
                anyFill = true;
        }
        for (const c of elementChildren(el))
            scan(c, false);
    };
    scan(root, false);
    if (anyStroke && anyFill)
        return "mixed";
    if (anyStroke)
        return "stroked-only";
    return "filled";
}
