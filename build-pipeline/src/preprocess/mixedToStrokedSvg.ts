/**
 * Mixed (fill + stroke) icons → SVG for the square SF Symbol pipeline.
 * Fill-only shapes become a stroked boundary path (representative stroke). Stroke-only
 * shapes pass through. Stroke+fill shapes emit three layers in order: fill-only clone,
 * fill-boundary path stroked with representative width/color, then stroke-only clone.
 * Text with stroke+fill skips the synthetic boundary path (fill-only + stroke-only only).
 * Limitations: same as mixedIconToFilled (no group/transform bake, heuristic paint only).
 */
import { XMLSerializer } from "@xmldom/xmldom";
import { readViewBox } from "../steps/sizeVariants.js";
import { fillElementToGeometry, jtsLinealGeometryToPathD } from "../steps/strokeToOutline.js";
import {
  deepCloneElement,
  elementChildren,
  localTag,
  parseSvgXml,
  svgDocumentElement,
  type SvgElement,
} from "../svg/xml.js";
import {
  elementHasVisibleFill,
  elementHasVisibleStroke,
  representativeStrokeStyleForMixedPreprocess,
} from "../routing/svgRouting.js";
import type Geometry from "jsts/org/locationtech/jts/geom/Geometry.js";

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

function collectGraphicalElements(root: SvgElement): SvgElement[] {
  const out: SvgElement[] = [];
  const walk = (el: SvgElement, inDefs: boolean) => {
    const tag = localTag(el);
    if (tag === "defs") {
      for (const c of elementChildren(el)) walk(c, true);
      return;
    }
    if (inDefs) {
      for (const c of elementChildren(el)) walk(c, true);
      return;
    }
    if (GRAPHICAL.has(tag)) out.push(el);
    for (const c of elementChildren(el)) walk(c, false);
  };
  walk(root, false);
  return out;
}

function escapeSvgAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function stripFillFromElement(el: SvgElement): void {
  el.removeAttribute("fill");
  el.removeAttribute("fill-rule");
  el.removeAttribute("fill-opacity");
  const style = el.getAttribute("style");
  if (!style) return;
  const kept: string[] = [];
  for (const part of style.split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim().toLowerCase();
    if (k === "fill" || k === "fill-rule" || k === "fill-opacity") continue;
    const v = part.trim();
    if (v) kept.push(v);
  }
  if (kept.length) el.setAttribute("style", kept.join(";"));
  else el.removeAttribute("style");
}

function stripStrokeFromElement(el: SvgElement): void {
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
  if (!style) return;
  const kept: string[] = [];
  for (const part of style.split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim().toLowerCase();
    if (k.startsWith("stroke")) continue;
    const v = part.trim();
    if (v) kept.push(v);
  }
  if (kept.length) el.setAttribute("style", kept.join(";"));
  else el.removeAttribute("style");
}

function serializeElement(el: SvgElement): string {
  return new XMLSerializer().serializeToString(el);
}

function fillBoundaryToStrokedPathMarkup(
  el: SvgElement,
  flatness: number,
  strokeWidth: number,
  strokeColor: string
): string {
  const gFill = fillElementToGeometry(el, flatness);
  if (!gFill) {
    throw new Error(
      "Mixed icon fill-to-stroke: no fill geometry for element (unsupported tag or empty path)."
    );
  }
  const gg = gFill as unknown as { isEmpty(): boolean };
  if (gg.isEmpty()) {
    throw new Error("Mixed icon fill-to-stroke: empty fill geometry.");
  }
  const boundary = (gFill as unknown as { getBoundary(): Geometry }).getBoundary();
  const bb = boundary as unknown as { isEmpty(): boolean };
  if (!boundary || bb.isEmpty()) {
    throw new Error("Mixed icon fill-to-stroke: could not compute fill boundary.");
  }
  const d = jtsLinealGeometryToPathD(boundary).trim();
  if (!d) {
    throw new Error("Mixed icon fill-to-stroke: boundary could not be serialized to a path.");
  }
  return (
    `<path fill="${escapeSvgAttr(strokeColor)}" stroke="${escapeSvgAttr(strokeColor)}" stroke-width="${strokeWidth}" ` +
    `stroke-linecap="round" stroke-linejoin="round" d="${escapeSvgAttr(d)}"/>`
  );
}

export function mixedIconToStrokedSvg(xml: string, opts?: { flatness?: number }): string {
  const flatness = opts?.flatness ?? 1;
  const doc = parseSvgXml(xml);
  const root = svgDocumentElement(doc);
  const [ox, oy, ow, oh] = readViewBox(root);
  const { width: repW, color: repColor } = representativeStrokeStyleForMixedPreprocess(root);

  const chunks: string[] = [];
  for (const el of collectGraphicalElements(root)) {
    const hasS = elementHasVisibleStroke(el);
    const hasF = elementHasVisibleFill(el);

    if (hasS && !hasF) {
      chunks.push(serializeElement(el));
    } else if (!hasS && hasF) {
      chunks.push(fillBoundaryToStrokedPathMarkup(el, flatness, repW, repColor));
    } else if (hasS && hasF) {
      const fillOnly = deepCloneElement(el);
      stripStrokeFromElement(fillOnly);
      chunks.push(serializeElement(fillOnly));
      if (localTag(el) !== "text") {
        chunks.push(fillBoundaryToStrokedPathMarkup(el, flatness, repW, repColor));
      }
      const strokeOnly = deepCloneElement(el);
      stripFillFromElement(strokeOnly);
      chunks.push(serializeElement(strokeOnly));
    } else {
      chunks.push(serializeElement(el));
    }
  }

  if (!chunks.length) {
    throw new Error("Mixed icon fill-to-stroke: no graphical content to emit.");
  }

  const vb = `${ox} ${oy} ${ow} ${oh}`;
  const inner = chunks.join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${ow}" height="${oh}">${inner}</svg>`
  );
}
