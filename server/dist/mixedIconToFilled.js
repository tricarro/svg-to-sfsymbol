import { readViewBox } from "./phase1.js";
import { fillElementToGeometry, jtsGeometryToSvgPathD, strokeElementToOutlineGeometry, unionJtsGeometries, } from "./phase4.js";
import { elementChildren, localTag, parseSvgXml, svgDocumentElement, } from "./xml.js";
const GRAPHICAL = new Set([
    "path",
    "line",
    "polyline",
    "polygon",
    "rect",
    "circle",
    "ellipse",
    "text",
]);
function collectGraphicalElements(root) {
    const out = [];
    const walk = (el, inDefs) => {
        const tag = localTag(el);
        if (tag === "defs") {
            for (const c of elementChildren(el))
                walk(c, true);
            return;
        }
        if (inDefs) {
            for (const c of elementChildren(el))
                walk(c, true);
            return;
        }
        if (GRAPHICAL.has(tag))
            out.push(el);
        for (const c of elementChildren(el))
            walk(c, false);
    };
    walk(root, false);
    return out;
}
function escapeSvgAttr(s) {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
/**
 * Outline strokes, union with fill regions, emit a minimal fill-only SVG (black).
 */
export function mixedIconToFillOnlySvg(xml, opts) {
    const flatness = opts?.flatness ?? 1;
    const doc = parseSvgXml(xml);
    const root = svgDocumentElement(doc);
    const [ox, oy, ow, oh] = readViewBox(root);
    const pieces = [];
    for (const el of collectGraphicalElements(root)) {
        const gStroke = strokeElementToOutlineGeometry(el, flatness);
        if (gStroke) {
            const gg = gStroke;
            if (!gg.isEmpty())
                pieces.push(gStroke);
        }
        const gFill = fillElementToGeometry(el, flatness);
        if (gFill) {
            const gg = gFill;
            if (!gg.isEmpty())
                pieces.push(gFill);
        }
    }
    const unioned = unionJtsGeometries(pieces);
    if (!unioned) {
        throw new Error("Mixed icon conversion produced no geometry (unsupported shapes, dashed strokes, or empty paths).");
    }
    const uu = unioned;
    if (uu.isEmpty()) {
        throw new Error("Mixed icon union produced empty geometry.");
    }
    const { d, evenodd } = jtsGeometryToSvgPathD(unioned);
    if (!d.trim()) {
        throw new Error("Mixed icon union could not be serialized to a path.");
    }
    const vb = `${ox} ${oy} ${ow} ${oh}`;
    const rule = evenodd ? ' fill-rule="evenodd"' : "";
    return (`<?xml version="1.0" encoding="UTF-8"?>` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${ow}" height="${oh}">` +
        `<path fill="#000000"${rule} d="${escapeSvgAttr(d)}"/>` +
        `</svg>`);
}
