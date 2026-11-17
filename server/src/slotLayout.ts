/**
 * Shared template-slot layout: artwork bounding boxes, centering on the slot wireframe
 * (Apple centers it on cap height), and per-variant left/right margin guides.
 */
import SvgPath from "svgpath";
import { formatCoord } from "./curveFit.js";
import { elementChildren, localTag, SVG_NS, type SvgElement } from "./xml.js";

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Margin guide padding on each side of the artwork, as a fraction of the variant's square side. */
export const MARGIN_PADDING_RATIO = 1 / 16;

const MARGIN_STYLE = "fill:none;stroke:#00AEEF;stroke-width:0.5;opacity:1.0;";

function num(el: SvgElement, name: string): number {
  const v = parseFloat(el.getAttribute(name) || "0");
  return Number.isFinite(v) ? v : 0;
}

export function shapeToPathD(el: SvgElement): string | null {
  const tag = localTag(el);
  if (tag === "path") return el.getAttribute("d");
  if (tag === "rect") {
    const x = num(el, "x");
    const y = num(el, "y");
    const w = num(el, "width");
    const h = num(el, "height");
    if (!(w > 0 && h > 0)) return null;
    const rxAttr = el.getAttribute("rx");
    const ryAttr = el.getAttribute("ry");
    let rx = rxAttr !== null ? num(el, "rx") : ryAttr !== null ? num(el, "ry") : 0;
    let ry = ryAttr !== null ? num(el, "ry") : rx;
    rx = Math.min(Math.max(rx, 0), w / 2);
    ry = Math.min(Math.max(ry, 0), h / 2);
    if (rx <= 0 || ry <= 0) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
    const arc = (ex: number, ey: number) => `A${rx} ${ry} 0 0 1 ${ex} ${ey}`;
    return (
      `M${x + rx} ${y}H${x + w - rx}${arc(x + w, y + ry)}V${y + h - ry}${arc(x + w - rx, y + h)}` +
      `H${x + rx}${arc(x, y + h - ry)}V${y + ry}${arc(x + rx, y)}Z`
    );
  }
  if (tag === "circle" || tag === "ellipse") {
    const cx = num(el, "cx");
    const cy = num(el, "cy");
    const rx = tag === "circle" ? num(el, "r") : num(el, "rx");
    const ry = tag === "circle" ? num(el, "r") : num(el, "ry");
    if (!(rx > 0 && ry > 0)) return null;
    return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
  }
  if (tag === "line") {
    return `M${num(el, "x1")} ${num(el, "y1")}L${num(el, "x2")} ${num(el, "y2")}`;
  }
  if (tag === "polygon" || tag === "polyline") {
    const pts = (el.getAttribute("points") || "").trim();
    if (!pts) return null;
    return `M${pts}${tag === "polygon" ? "Z" : ""}`;
  }
  return null;
}

function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const ts: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) ts.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      ts.push((-b + s) / (2 * a), (-b - s) / (2 * a));
    }
  }
  return ts
    .filter((t) => t > 0 && t < 1)
    .map((t) => {
      const u = 1 - t;
      return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
    });
}

function extendWithPath(box: BBox, d: string, transform: string): void {
  const p = new SvgPath(d).transform(transform).abs().unshort().unarc();
  const addX = (x: number) => {
    box.minX = Math.min(box.minX, x);
    box.maxX = Math.max(box.maxX, x);
  };
  const addY = (y: number) => {
    box.minY = Math.min(box.minY, y);
    box.maxY = Math.max(box.maxY, y);
  };
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  for (const s of (p as unknown as { segments: (string | number)[][] }).segments) {
    const cmd = String(s[0]);
    const n = s.slice(1).map(Number);
    if (cmd === "M") {
      cx = sx = n[0];
      cy = sy = n[1];
      addX(cx);
      addY(cy);
    } else if (cmd === "L") {
      cx = n[0];
      cy = n[1];
      addX(cx);
      addY(cy);
    } else if (cmd === "H") {
      cx = n[0];
      addX(cx);
    } else if (cmd === "V") {
      cy = n[0];
      addY(cy);
    } else if (cmd === "C") {
      cubicExtrema(cx, n[0], n[2], n[4]).forEach(addX);
      cubicExtrema(cy, n[1], n[3], n[5]).forEach(addY);
      cx = n[4];
      cy = n[5];
      addX(cx);
      addY(cy);
    } else if (cmd === "Q") {
      const c1x = cx + (2 / 3) * (n[0] - cx);
      const c1y = cy + (2 / 3) * (n[1] - cy);
      const c2x = n[2] + (2 / 3) * (n[0] - n[2]);
      const c2y = n[3] + (2 / 3) * (n[1] - n[3]);
      cubicExtrema(cx, c1x, c2x, n[2]).forEach(addX);
      cubicExtrema(cy, c1y, c2y, n[3]).forEach(addY);
      cx = n[2];
      cy = n[3];
      addX(cx);
      addY(cy);
    } else if (cmd === "Z") {
      cx = sx;
      cy = sy;
    }
  }
}

/** Tight bounding box of the drawn artwork under `nodes` (defs skipped, transforms applied). */
export function elementsBBox(nodes: SvgElement[]): BBox | null {
  const box: BBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const walk = (el: SvgElement, transform: string) => {
    if (localTag(el) === "defs") return;
    const own = el.getAttribute("transform");
    const t = own ? `${transform} ${own}`.trim() : transform;
    const d = shapeToPathD(el);
    if (d) extendWithPath(box, d, t);
    for (const c of elementChildren(el)) walk(c, t);
  };
  for (const n of nodes) walk(n, "");
  return Number.isFinite(box.minX) && Number.isFinite(box.minY) ? box : null;
}

export function bboxCenter(b: BBox): [number, number] {
  return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
}

/** Translation of a slot group (`matrix(1 0 0 1 x y)` or `translate(x y)` in the Apple templates). */
export function slotOrigin(slot: SvgElement): [number, number] {
  const t = slot.getAttribute("transform") || "";
  const m = /matrix\(\s*([^)]+)\)/.exec(t);
  if (m) {
    const v = m[1].split(/[\s,]+/).map(Number);
    if (v.length === 6) return [v[4], v[5]];
  }
  const tr = /translate\(\s*([^)]+)\)/.exec(t);
  if (tr) {
    const v = tr[1].split(/[\s,]+/).map(Number);
    return [v[0] || 0, v[1] || 0];
  }
  return [0, 0];
}

function findGuidesGroup(root: SvgElement): SvgElement | null {
  for (const ch of elementChildren(root)) {
    if (localTag(ch) === "g" && ch.getAttribute("id") === "Guides") return ch;
  }
  return null;
}

/**
 * Replace `left-margin-<slotId>` / `right-margin-<slotId>` in the Guides layer so the margins
 * hug the placed artwork (`placed` is in the slot's local coordinates) plus `padding`.
 */
export function writeMarginGuides(
  templateRoot: SvgElement,
  slot: SvgElement,
  slotId: string,
  placed: BBox,
  padding: number
): void {
  const guides = findGuidesGroup(templateRoot);
  const doc = templateRoot.ownerDocument;
  if (!guides || !doc) return;
  for (const ch of [...elementChildren(guides)]) {
    const id = ch.getAttribute("id");
    if (id !== `left-margin-${slotId}` && id !== `right-margin-${slotId}`) continue;
    const prev = ch.previousSibling;
    if (prev && prev.nodeType === 3 && !(prev.nodeValue ?? "").trim()) guides.removeChild(prev);
    guides.removeChild(ch);
  }
  const trailing = guides.lastChild;
  if (trailing && trailing.nodeType === 3 && !(trailing.nodeValue ?? "").trim()) guides.removeChild(trailing);
  const [ox, oy] = slotOrigin(slot);
  const y1 = formatCoord(oy + placed.minY);
  const y2 = formatCoord(oy + placed.maxY);
  for (const [side, x] of [
    ["right", ox + placed.maxX + padding],
    ["left", ox + placed.minX - padding],
  ] as const) {
    const line = doc.createElementNS(SVG_NS, "line");
    line.setAttribute("id", `${side}-margin-${slotId}`);
    line.setAttribute("style", MARGIN_STYLE);
    line.setAttribute("x1", formatCoord(x));
    line.setAttribute("x2", formatCoord(x));
    line.setAttribute("y1", y1);
    line.setAttribute("y2", y2);
    guides.appendChild(doc.createTextNode("\n  "));
    guides.appendChild(line);
  }
  guides.appendChild(doc.createTextNode("\n "));
}
