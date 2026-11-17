/**
 * Mixed (fill + stroke) icons → SVG for the square SF Symbol pipeline.
 * Fill-only shapes become a fill path marked with FILL_OFFSET_ATTR (plus a representative
 * stroke so phase 3 assigns it a weight); phase 4 grows or shrinks that fill relative to
 * Regular instead of stroking its boundary. Stroke-only shapes pass through. Stroke+fill
 * shapes emit an unmodified fill-only clone, then a stroke-only clone.
 * Limitations: same as mixedIconToFilled (no group/transform bake, heuristic paint only).
 */
import { XMLSerializer } from "@xmldom/xmldom";
import { readViewBox, SOURCE_STROKE_WIDTH_ATTR } from "./phase1.js";
import type Geometry from "jsts/org/locationtech/jts/geom/Geometry.js";
import {
  FILL_OFFSET_ATTR,
  fillElementToGeometry,
  jtsGeometryToSvgPathD,
  unionJtsGeometries,
} from "./phase4.js";
import {
  deepCloneElement,
  elementChildren,
  localTag,
  materializeInheritedFill,
  parseSvgXml,
  svgDocumentElement,
  type SvgElement,
} from "./xml.js";
import {
  elementHasVisibleFill,
  elementHasVisibleStroke,
  representativeStrokeStyleForMixedPreprocess,
} from "./svgStrokeDetection.js";
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

function fillGeometryOf(el: SvgElement, flatness: number): Geometry {
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
  return gFill;
}

function fillToOffsetPathMarkup(gFill: Geometry, strokeWidth: number, strokeColor: string): string {
  const { d, evenodd } = jtsGeometryToSvgPathD(gFill);
  if (!d) {
    throw new Error("Mixed icon fill-to-stroke: fill could not be serialized to a path.");
  }
  const rule = evenodd ? ` fill-rule="evenodd"` : "";
  return (
    `<path ${FILL_OFFSET_ATTR}="1" ${SOURCE_STROKE_WIDTH_ATTR}="${strokeWidth}" ` +
    `fill="${escapeSvgAttr(strokeColor)}"${rule} ` +
    `stroke="${escapeSvgAttr(strokeColor)}" stroke-width="${strokeWidth}" d="${escapeSvgAttr(d)}"/>`
  );
}

export function mixedIconToStrokedSvg(xml: string, opts?: { flatness?: number }): string {
  const flatness = opts?.flatness ?? 1;
  const doc = parseSvgXml(xml);
  const root = svgDocumentElement(doc);
  materializeInheritedFill(root);
  const [ox, oy, ow, oh] = readViewBox(root);
  const { width: repW, color: repColor } = representativeStrokeStyleForMixedPreprocess(root);

  // Fill-only shapes are offset as one union: overlapping fills (e.g. a solid body plus an
  // outlined rim) offset separately would open gaps between them at light weights.
  const chunks: string[] = [];
  const fillGeoms: Geometry[] = [];
  let fillChunkIndex = -1;
  for (const el of collectGraphicalElements(root)) {
    const hasS = elementHasVisibleStroke(el);
    const hasF = elementHasVisibleFill(el);

    if (hasS && !hasF) {
      chunks.push(serializeElement(el));
    } else if (!hasS && hasF) {
      if (localTag(el) === "text") {
        chunks.push(serializeElement(el));
        continue;
      }
      if (fillChunkIndex === -1) {
        fillChunkIndex = chunks.length;
        chunks.push("");
      }
      fillGeoms.push(fillGeometryOf(el, flatness));
    } else if (hasS && hasF) {
      // The stroke ring carries the weight; offsetting the fill too would open a gap
      // between them at weights lighter than Regular.
      const fillOnly = deepCloneElement(el);
      stripStrokeFromElement(fillOnly);
      chunks.push(serializeElement(fillOnly));
      const strokeOnly = deepCloneElement(el);
      stripFillFromElement(strokeOnly);
      strokeOnly.setAttribute("fill", "none");
      chunks.push(serializeElement(strokeOnly));
    } else {
      chunks.push(serializeElement(el));
    }
  }

  if (fillChunkIndex !== -1) {
    const merged = unionJtsGeometries(fillGeoms);
    if (!merged) throw new Error("Mixed icon fill-to-stroke: empty fill geometry.");
    chunks[fillChunkIndex] = fillToOffsetPathMarkup(merged, repW, repColor);
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
