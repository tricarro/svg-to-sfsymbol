/**
 * Classify upload SVG as stroked-input vs filled-input for routing.
 * Heuristic only: ignores <use>, complex CSS, inherited display, etc.
 */
import {
  elementChildren,
  localTag,
  parseSvgXml,
  svgDocumentElement,
  type SvgElement,
} from "./xml.js";

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

function parseInlineStyle(style: string | null): Map<string, string> {
  const m = new Map<string, string>();
  if (!style) return m;
  for (const part of style.split(";")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim().toLowerCase();
    const v = part.slice(idx + 1).trim();
    if (k) m.set(k, v);
  }
  return m;
}

function strokeColorFromElement(el: SvgElement): string | null {
  const a = el.getAttribute("stroke");
  if (a !== null && a.trim() !== "") return a.trim();
  const st = parseInlineStyle(el.getAttribute("style"));
  const v = st.get("stroke");
  return v !== undefined && v.trim() !== "" ? v.trim() : null;
}

function strokeWidthFromElement(el: SvgElement): number | null {
  const a = el.getAttribute("stroke-width");
  if (a !== null && a.trim() !== "") {
    const n = parseFloat(a);
    return Number.isNaN(n) ? null : n;
  }
  const st = parseInlineStyle(el.getAttribute("style"));
  const w = st.get("stroke-width");
  if (w === undefined || w.trim() === "") return null;
  const n = parseFloat(w);
  return Number.isNaN(n) ? null : n;
}

function isNoneOrTransparent(color: string): boolean {
  const c = color.trim().toLowerCase().replace(/\s+/g, "");
  return c === "none" || c === "transparent";
}

/**
 * True if this element paints a visible stroke per presentation attrs / inline style only.
 */
export function elementHasVisibleStroke(el: SvgElement): boolean {
  const color = strokeColorFromElement(el);
  if (color === null) return false;
  if (isNoneOrTransparent(color)) return false;
  const w = strokeWidthFromElement(el);
  if (w !== null && w <= 0) return false;
  return true;
}

function walk(el: SvgElement, inDefs: boolean): "stroked" | null {
  const tag = localTag(el);
  if (tag === "defs") {
    for (const c of elementChildren(el)) {
      const r = walk(c, true);
      if (r) return r;
    }
    return null;
  }
  if (inDefs) {
    for (const c of elementChildren(el)) {
      const r = walk(c, true);
      if (r) return r;
    }
    return null;
  }

  if (GRAPHICAL_TAGS.has(tag) && elementHasVisibleStroke(el)) {
    return "stroked";
  }

  for (const c of elementChildren(el)) {
    const r = walk(c, false);
    if (r) return r;
  }
  return null;
}

/**
 * Parse SVG XML and return "stroked" if any graphical element has a visible stroke;
 * otherwise "filled" (fill-only / no stroke artwork).
 */
export function classifySvgStrokedOrFilled(xml: string): "stroked" | "filled" {
  const doc = parseSvgXml(xml);
  const root = svgDocumentElement(doc);
  return walk(root, false) ?? "filled";
}
