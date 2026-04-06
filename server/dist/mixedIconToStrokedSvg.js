/**
 * Mixed (fill + stroke) icons → SVG for the square SF Symbol pipeline.
 * Elements with only fill (no visible stroke) become stroked boundary paths using representative
 * stroke width/color from stroked elements in the document. Elements with both stroke and fill pass
 * through with native fill and stroke unchanged.
 * Limitations: same as mixedIconToFilled (no group/transform bake, heuristic paint only).
 */
import { XMLSerializer } from "@xmldom/xmldom";
import { readViewBox } from "./phase1.js";
import { fillElementToGeometry, jtsLinealGeometryToPathD } from "./phase4.js";
import { elementChildren, localTag, parseSvgXml, svgDocumentElement, } from "./xml.js";
import { elementHasVisibleFill, elementHasVisibleStroke, representativeStrokeStyleForMixedPreprocess, } from "./svgStrokeDetection.js";
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
function serializeElement(el) {
    return new XMLSerializer().serializeToString(el);
}
function fillBoundaryToStrokedPathMarkup(el, flatness, strokeWidth, strokeColor) {
    const gFill = fillElementToGeometry(el, flatness);
    if (!gFill) {
        throw new Error("Mixed icon fill-to-stroke: no fill geometry for element (unsupported tag or empty path).");
    }
    const gg = gFill;
    if (gg.isEmpty()) {
        throw new Error("Mixed icon fill-to-stroke: empty fill geometry.");
    }
    const boundary = gFill.getBoundary();
    const bb = boundary;
    if (!boundary || bb.isEmpty()) {
        throw new Error("Mixed icon fill-to-stroke: could not compute fill boundary.");
    }
    const d = jtsLinealGeometryToPathD(boundary).trim();
    if (!d) {
        throw new Error("Mixed icon fill-to-stroke: boundary could not be serialized to a path.");
    }
    return (`<path fill="none" stroke="${escapeSvgAttr(strokeColor)}" stroke-width="${strokeWidth}" ` +
        `stroke-linecap="round" stroke-linejoin="round" d="${escapeSvgAttr(d)}"/>`);
}
export function mixedIconToStrokedSvg(xml, opts) {
    const flatness = opts?.flatness ?? 1;
    const doc = parseSvgXml(xml);
    const root = svgDocumentElement(doc);
    const [ox, oy, ow, oh] = readViewBox(root);
    const { width: repW, color: repColor } = representativeStrokeStyleForMixedPreprocess(root);
    const chunks = [];
    for (const el of collectGraphicalElements(root)) {
        const hasS = elementHasVisibleStroke(el);
        const hasF = elementHasVisibleFill(el);
        if (hasS && !hasF) {
            chunks.push(serializeElement(el));
        }
        else if (!hasS && hasF) {
            chunks.push(fillBoundaryToStrokedPathMarkup(el, flatness, repW, repColor));
        }
        else if (hasS && hasF) {
            chunks.push(serializeElement(el));
        }
        else {
            chunks.push(serializeElement(el));
        }
    }
    if (!chunks.length) {
        throw new Error("Mixed icon fill-to-stroke: no graphical content to emit.");
    }
    const vb = `${ox} ${oy} ${ow} ${oh}`;
    const inner = chunks.join("");
    return (`<?xml version="1.0" encoding="UTF-8"?>` +
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${ow}" height="${oh}">${inner}</svg>`);
}
