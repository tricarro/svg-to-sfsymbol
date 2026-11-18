/**
 * Stroke → filled outline via JSTS buffer (Shapely/GEOS analogue).
 */
import { readdirSync, writeFileSync } from "node:fs";
import type { PathLike } from "node:fs";
import { join } from "node:path";
import SvgPath from "svgpath";
import BufferOp from "jsts/org/locationtech/jts/operation/buffer/BufferOp.js";
import BufferParameters from "jsts/org/locationtech/jts/operation/buffer/BufferParameters.js";
import Coordinate from "jsts/org/locationtech/jts/geom/Coordinate.js";
import GeometryFactory from "jsts/org/locationtech/jts/geom/GeometryFactory.js";
import Polygon from "jsts/org/locationtech/jts/geom/Polygon.js";
import MultiPolygon from "jsts/org/locationtech/jts/geom/MultiPolygon.js";
import GeometryCollection from "jsts/org/locationtech/jts/geom/GeometryCollection.js";
import Geometry from "jsts/org/locationtech/jts/geom/Geometry.js";
import UnaryUnionOp from "jsts/org/locationtech/jts/operation/union/UnaryUnionOp.js";
import OverlayOp from "jsts/org/locationtech/jts/operation/overlay/OverlayOp.js";
import Polygonizer from "jsts/org/locationtech/jts/operation/polygonize/Polygonizer.js";
import InteriorPointArea from "jsts/org/locationtech/jts/algorithm/InteriorPointArea.js";
import { ringToCurvePathD } from "./curveFit.js";
import { SOURCE_STROKE_WIDTH_ATTR } from "./phase1.js";
import { shapeToPathD } from "./slotLayout.js";
import { elementIsStroked, parseWeightStem, STROKE_WIDTH_BY_WEIGHT_SUFFIX } from "./phase3.js";
import {
  elementChildren,
  elementToBytes,
  localTag,
  parseSvgFile,
  SVG_NS,
  svgDocumentElement,
  type SvgDocument,
  type SvgElement,
} from "./xml.js";

const COORD_EPS = 1e-7;
const _NUM_RE = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;

const geomFact = new GeometryFactory();

function dist(x0: number, y0: number, x1: number, y1: number): number {
  return Math.hypot(x1 - x0, y1 - y0);
}

function sampleCubic(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  flatness: number
): [number, number][] {
  const ln = Math.max(
    1e-6,
    dist(x0, y0, x1, y1) + dist(x1, y1, x2, y2) + dist(x2, y2, x3, y3)
  );
  const n = Math.max(4, Math.min(256, Math.floor(ln / flatness) + 1));
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    const u = 1 - t;
    const x = u ** 3 * x0 + 3 * u ** 2 * t * x1 + 3 * u * t ** 2 * x2 + t ** 3 * x3;
    const y = u ** 3 * y0 + 3 * u ** 2 * t * y1 + 3 * u * t ** 2 * y2 + t ** 3 * y3;
    out.push([x, y]);
  }
  return out;
}

function sampleQuad(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  flatness: number
): [number, number][] {
  const ln = Math.max(1e-6, dist(x0, y0, x1, y1) + dist(x1, y1, x2, y2));
  const n = Math.max(4, Math.min(256, Math.floor(ln / flatness) + 1));
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * x1 + t * t * x2;
    const y = u * u * y0 + 2 * u * t * y1 + t * t * y2;
    out.push([x, y]);
  }
  return out;
}

type Subpath = { coords: [number, number][]; closed: boolean };

function dedupeAppend(pts: [number, number][], x: number, y: number): void {
  const last = pts[pts.length - 1];
  if (last && Math.abs(last[0] - x) < COORD_EPS && Math.abs(last[1] - y) < COORD_EPS) {
    return;
  }
  pts.push([x, y]);
}

function flattenPathToSubpaths(d: string, flatness: number): Subpath[] {
  if (!d || !d.trim()) return [];
  let p: InstanceType<typeof SvgPath>;
  try {
    p = new SvgPath(d).abs().unshort().unarc();
  } catch {
    return [];
  }
  const segs = (p as unknown as { segments: (string | number)[][] }).segments;
  const subpaths: Subpath[] = [];
  let current: [number, number][] = [];
  let closed = false;
  let cx = 0;
  let cy = 0;
  let subStart: [number, number] = [0, 0];

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
    } else if (cmd === "L" || cmd === "l") {
      cx = Number(s[s.length - 2]);
      cy = Number(s[s.length - 1]);
      dedupeAppend(current, cx, cy);
    } else if (cmd === "H" || cmd === "h") {
      cx = Number(s[1]);
      dedupeAppend(current, cx, cy);
    } else if (cmd === "V" || cmd === "v") {
      cy = Number(s[1]);
      dedupeAppend(current, cx, cy);
    } else if (cmd === "C" || cmd === "c") {
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
    } else if (cmd === "Q" || cmd === "q") {
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
    } else if (cmd === "Z" || cmd === "z") {
      closed = true;
      dedupeAppend(current, subStart[0], subStart[1]);
    }
  }
  flush();
  return subpaths;
}

function parsePointsAttr(raw: string | null): [number, number][] {
  if (!raw) return [];
  _NUM_RE.lastIndex = 0;
  const nums: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = _NUM_RE.exec(raw)) !== null) {
    nums.push(parseFloat(m[0]));
  }
  if (nums.length % 2 !== 0) return [];
  const out: [number, number][] = [];
  for (let i = 0; i < nums.length; i += 2) {
    out.push([nums[i], nums[i + 1]]);
  }
  return out;
}

function parseStyle(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of style.split(";")) {
    const p = part.trim();
    if (!p || !p.includes(":")) continue;
    const [k, ...rest] = p.split(":");
    out[k.trim().toLowerCase()] = rest.join(":").trim();
  }
  return out;
}

function hasDasharray(el: SvgElement): boolean {
  const da = el.getAttribute("stroke-dasharray");
  if (da && da.trim() && da.trim().toLowerCase() !== "none") return true;
  const style = el.getAttribute("style");
  if (style) {
    const v = parseStyle(style)["stroke-dasharray"]?.trim() ?? "";
    if (v && v.toLowerCase() !== "none") return true;
  }
  return false;
}

function strokePaint(el: SvgElement): string {
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

function strokeWidthPx(el: SvgElement): number {
  const sw = el.getAttribute("stroke-width");
  if (sw) {
    return parseFloat(sw.replace(/px/gi, "").trim());
  }
  const style = el.getAttribute("style");
  if (style) {
    const w = parseStyle(style)["stroke-width"]?.replace(/px/gi, "").trim() ?? "";
    if (w) return parseFloat(w);
  }
  return 1;
}

function capStyle(el: SvgElement): number {
  let raw = (el.getAttribute("stroke-linecap") || "").trim().toLowerCase();
  if (!raw) {
    const style = el.getAttribute("style");
    if (style) raw = parseStyle(style)["stroke-linecap"]?.trim().toLowerCase() ?? "";
  }
  if (raw === "round") return BufferParameters.CAP_ROUND;
  if (raw === "square") return BufferParameters.CAP_SQUARE;
  return BufferParameters.CAP_FLAT;
}

function joinStyle(el: SvgElement): number {
  let raw = (el.getAttribute("stroke-linejoin") || "").trim().toLowerCase();
  if (!raw) {
    const style = el.getAttribute("style");
    if (style) raw = parseStyle(style)["stroke-linejoin"]?.trim().toLowerCase() ?? "";
  }
  if (raw === "round") return BufferParameters.JOIN_ROUND;
  if (raw === "bevel") return BufferParameters.JOIN_BEVEL;
  return BufferParameters.JOIN_MITRE;
}

function mitreLimit(el: SvgElement): number {
  const raw = el.getAttribute("stroke-miterlimit");
  if (raw) {
    const v = parseFloat(raw);
    if (!Number.isNaN(v)) return v;
  }
  const style = el.getAttribute("style");
  if (style) {
    const v = parseStyle(style)["stroke-miterlimit"]?.trim() ?? "";
    if (v) {
      const n = parseFloat(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 4.0;
}

function visibleFill(el: SvgElement): boolean {
  const f = el.getAttribute("fill");
  if (f !== null) {
    const fl = f.trim().toLowerCase();
    if (fl === "none" || fl === "transparent" || fl === "") return false;
    return true;
  }
  const style = el.getAttribute("style");
  if (style) {
    const fl = parseStyle(style).fill?.trim().toLowerCase() ?? "";
    if (fl === "none" || fl === "transparent") return false;
    if (fl) return true;
  }
  return false;
}

function stripStrokePresentation(el: SvgElement): void {
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
  const sd = parseStyle(style);
  for (const key of Object.keys(sd)) {
    if (key.startsWith("stroke")) delete sd[key];
  }
  const keys = Object.keys(sd);
  if (keys.length) {
    el.setAttribute("style", keys.map((k) => `${k}:${sd[k]}`).join(";"));
  } else {
    el.removeAttribute("style");
  }
}

function ringToD(coords: [number, number][]): string {
  return ringToCurvePathD(coords);
}

function coordinatesToOpenPathD(coords: { x: number; y: number }[]): string {
  if (coords.length < 2) return "";
  const parts = [`M ${coords[0].x.toPrecision(6)},${coords[0].y.toPrecision(6)}`];
  for (let i = 1; i < coords.length; i++) {
    parts.push(`L ${coords[i].x.toPrecision(6)},${coords[i].y.toPrecision(6)}`);
  }
  return parts.join(" ");
}

function coordinatesToClosedPathDFromCoords(coords: { x: number; y: number }[]): string {
  if (coords.length < 2) return "";
  let c = coords.map((p) => [p.x, p.y] as [number, number]);
  const last = c[c.length - 1];
  const first = c[0];
  if (
    c.length >= 2 &&
    Math.abs(first[0] - last[0]) < COORD_EPS &&
    Math.abs(first[1] - last[1]) < COORD_EPS
  ) {
    c = c.slice(0, -1);
  }
  if (c.length < 2) return "";
  const parts = [`M ${c[0][0].toPrecision(6)},${c[0][1].toPrecision(6)}`];
  for (let i = 1; i < c.length; i++) {
    parts.push(`L ${c[i][0].toPrecision(6)},${c[i][1].toPrecision(6)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

/**
 * Serialize LineString / LinearRing / MultiLineString / line-only GeometryCollection to SVG path d.
 * Used for polygon fill boundaries (getBoundary) in mixed-icon preprocessing.
 */
export function jtsLinealGeometryToPathD(geom: Geometry): string {
  const g = geom as unknown as {
    isEmpty(): boolean;
    getGeometryType(): string;
    getNumGeometries(): number;
    getGeometryN(i: number): Geometry;
    getCoordinates(): { x: number; y: number }[];
    isClosed(): boolean;
  };
  if (g.isEmpty()) return "";
  const gt = g.getGeometryType();
  if (gt === "LineString" || gt === "LinearRing") {
    const coords = g.getCoordinates();
    if (gt === "LinearRing" || (typeof g.isClosed === "function" && g.isClosed())) {
      return coordinatesToClosedPathDFromCoords(coords);
    }
    return coordinatesToOpenPathD(coords);
  }
  if (gt === "MultiLineString") {
    const chunks: string[] = [];
    for (let i = 0; i < g.getNumGeometries(); i++) {
      const part = jtsLinealGeometryToPathD(g.getGeometryN(i));
      if (part) chunks.push(part);
    }
    return chunks.join(" ").trim();
  }
  if (geom instanceof GeometryCollection) {
    const chunks: string[] = [];
    for (let i = 0; i < g.getNumGeometries(); i++) {
      const part = jtsLinealGeometryToPathD(g.getGeometryN(i));
      if (part) chunks.push(part);
    }
    return chunks.join(" ").trim();
  }
  return "";
}

function polygonToPathD(poly: Polygon): { d: string; evenodd: boolean } {
  const shell = poly.getExteriorRing();
  const coords = shell.getCoordinates();
  const exterior: [number, number][] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    exterior.push([coords[i].x, coords[i].y]);
  }
  const parts: string[] = [];
  const rd = ringToD(exterior);
  if (rd) parts.push(rd);
  let needsEvenodd = false;
  for (let hi = 0; hi < poly.getNumInteriorRing(); hi++) {
    const hole = poly.getInteriorRingN(hi);
    const hc = hole.getCoordinates();
    const hpts: [number, number][] = [];
    for (let i = 0; i < hc.length - 1; i++) {
      hpts.push([hc[i].x, hc[i].y]);
    }
    const hd = ringToD(hpts);
    if (hd) parts.push(hd);
    needsEvenodd = true;
  }
  const d = parts.filter(Boolean).join(" ").trim();
  return { d, evenodd: needsEvenodd };
}

function geometryToPathD(geom: Geometry): {
  d: string;
  evenodd: boolean;
} {
  const g = geom as unknown as {
    isEmpty(): boolean;
    getGeometryType(): string;
    getNumGeometries(): number;
    getGeometryN(i: number): Geometry;
  };
  if (g.isEmpty()) return { d: "", evenodd: false };
  const gt = g.getGeometryType();
  if (gt === "Polygon") {
    return polygonToPathD(geom as unknown as Polygon);
  }
  if (gt === "MultiPolygon") {
    const mp = geom as unknown as MultiPolygon;
    const chunks: string[] = [];
    let needs = false;
    for (let i = 0; i < mp.getNumGeometries(); i++) {
      const { d, evenodd } = polygonToPathD(mp.getGeometryN(i) as unknown as Polygon);
      if (d) chunks.push(d);
      needs = needs || evenodd;
    }
    return {
      d: chunks.join(" ").trim(),
      evenodd: needs || mp.getNumGeometries() > 1,
    };
  }
  if (gt === "Point") return { d: "", evenodd: false };
  if (geom instanceof GeometryCollection) {
    const polys: Polygon[] = [];
    for (let i = 0; i < g.getNumGeometries(); i++) {
      const gi = g.getGeometryN(i) as unknown as { getGeometryType(): string };
      if (gi.getGeometryType() === "Polygon") polys.push(gi as unknown as Polygon);
    }
    if (!polys.length) return { d: "", evenodd: false };
    if (polys.length === 1) return polygonToPathD(polys[0]);
    const mp = geomFact.createMultiPolygon(polys);
    return geometryToPathD(mp as unknown as Geometry);
  }
  return { d: "", evenodd: false };
}

function coordsToLinearRing(coords: [number, number][]): Coordinate[] {
  return coords.map(([x, y]) => new Coordinate(x, y));
}

function subpathToFilledPolygon(sp: Subpath): Polygon | null {
  if (sp.coords.length < 2) return null;
  const pts: [number, number][] = sp.coords.map(([x, y]) => [x, y]);
  const first = pts[0];
  const last = pts[pts.length - 1];
  const explicitClose =
    sp.closed ||
    (Math.abs(first[0] - last[0]) < COORD_EPS && Math.abs(first[1] - last[1]) < COORD_EPS);
  if (!explicitClose) {
    pts.push([first[0], first[1]]);
  }
  const f = pts[0];
  const ln = pts[pts.length - 1];
  if (Math.abs(f[0] - ln[0]) >= COORD_EPS || Math.abs(f[1] - ln[1]) >= COORD_EPS) {
    pts.push([f[0], f[1]]);
  }
  if (pts.length < 4) return null;
  try {
    const ring = geomFact.createLinearRing(coordsToLinearRing(pts));
    return geomFact.createPolygon(ring);
  } catch {
    return null;
  }
}

function signedRingArea(coords: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < coords.length; i++) {
    const [x0, y0] = coords[i];
    const [x1, y1] = coords[(i + 1) % coords.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

function cleanPolygon(sp: Subpath): Geometry | null {
  const poly = subpathToFilledPolygon(sp);
  if (!poly) return null;
  const clean = new BufferOp(poly, new BufferParameters()).getResultGeometry(0) as unknown as Geometry;
  return (clean as unknown as { isEmpty(): boolean }).isEmpty() ? null : clean;
}

function windingNumber(x: number, y: number, coords: [number, number][]): number {
  let wn = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = coords[i];
    const [x1, y1] = coords[(i + 1) % n];
    const side = (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0);
    if (y0 <= y) {
      if (y1 > y && side > 0) wn++;
    } else if (y1 <= y && side < 0) {
      wn--;
    }
  }
  return wn;
}

/**
 * Exact nonzero fill: node every ring against the others, polygonize the arrangement and
 * keep faces whose winding number is non-zero. Outlined-stroke exports (Figma) build one
 * shape from many overlapping pieces wound in both directions, so sign-based shortcuts
 * carve notches out of them.
 */
function nonzeroFillGeometry(subpaths: Subpath[]): Geometry | null {
  const rings = subpaths
    .map((sp) => {
      const c = sp.coords.slice();
      const [fx, fy] = c[0];
      const [lx, ly] = c[c.length - 1];
      if (fx === lx && fy === ly) c.pop();
      return c;
    })
    .filter((c) => c.length >= 3);
  if (!rings.length) return null;
  const lines = rings.map((c) =>
    geomFact.createLineString(coordsToLinearRing(c.concat([c[0]])))
  );
  const noded = UnaryUnionOp.union(geomFact.createMultiLineString(lines));
  const polygonizer = new Polygonizer();
  polygonizer.add(noded);
  const faces = (polygonizer.getPolygons() as unknown as { toArray(): Geometry[] }).toArray();
  const kept = faces.filter((face) => {
    const p = InteriorPointArea.getInteriorPoint(face) as { x: number; y: number } | null;
    if (!p) return false;
    return rings.reduce((wn, c) => wn + windingNumber(p.x, p.y, c), 0) !== 0;
  });
  return unionJtsGeometries(kept);
}

/** Fill area of a multi-subpath shape. evenodd: XOR of rings. nonzero: exact winding. */
function fillSubpathsToGeometry(subpaths: Subpath[], fillRule: "nonzero" | "evenodd" = "nonzero"): Geometry | null {
  const rings: { g: Geometry; area: number }[] = [];
  for (const sp of subpaths) {
    const g = cleanPolygon(sp);
    if (g) rings.push({ g, area: signedRingArea(sp.coords) });
  }
  if (!rings.length) return null;
  if (rings.length === 1) return rings[0].g;
  if (fillRule === "evenodd") {
    return rings.slice(1).reduce((acc, r) => OverlayOp.symDifference(acc, r.g) as Geometry, rings[0].g);
  }
  return nonzeroFillGeometry(subpaths);
}

function fillRuleOf(el: SvgElement): "nonzero" | "evenodd" {
  let raw = el.getAttribute("fill-rule") ?? "";
  if (!raw) {
    const style = el.getAttribute("style");
    if (style) raw = parseStyle(style)["fill-rule"] ?? "";
  }
  return raw.trim().toLowerCase() === "evenodd" ? "evenodd" : "nonzero";
}

function rectToFillPolygon(el: SvgElement): Polygon | null {
  const x = parseFloat(el.getAttribute("x") || "0");
  const y = parseFloat(el.getAttribute("y") || "0");
  const w = parseFloat(el.getAttribute("width") || "0");
  const h = parseFloat(el.getAttribute("height") || "0");
  if (!(w > 0 && h > 0)) return null;
  const pts: [number, number][] = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y],
  ];
  try {
    const ring = geomFact.createLinearRing(coordsToLinearRing(pts));
    return geomFact.createPolygon(ring);
  } catch {
    return null;
  }
}

function circleToFillPolygon(el: SvgElement, segments = 48): Polygon | null {
  const cx = parseFloat(el.getAttribute("cx") || "0");
  const cy = parseFloat(el.getAttribute("cy") || "0");
  const r = parseFloat(el.getAttribute("r") || "0");
  if (!(r > 0)) return null;
  const pts: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * 2 * Math.PI;
    pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  if (pts.length < 3) return null;
  const f = pts[0];
  const l = pts[pts.length - 1];
  if (Math.abs(f[0] - l[0]) > COORD_EPS || Math.abs(f[1] - l[1]) > COORD_EPS) {
    pts.push([f[0], f[1]]);
  }
  try {
    const ring = geomFact.createLinearRing(coordsToLinearRing(pts));
    return geomFact.createPolygon(ring);
  } catch {
    return null;
  }
}

function ellipseToFillPolygon(el: SvgElement, segments = 48): Polygon | null {
  const cx = parseFloat(el.getAttribute("cx") || "0");
  const cy = parseFloat(el.getAttribute("cy") || "0");
  const rx = parseFloat(el.getAttribute("rx") || "0");
  const ry = parseFloat(el.getAttribute("ry") || "0");
  if (!(rx > 0 && ry > 0)) return null;
  const pts: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * 2 * Math.PI;
    pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  if (pts.length < 3) return null;
  const f = pts[0];
  const l = pts[pts.length - 1];
  if (Math.abs(f[0] - l[0]) > COORD_EPS || Math.abs(f[1] - l[1]) > COORD_EPS) {
    pts.push([f[0], f[1]]);
  }
  try {
    const ring = geomFact.createLinearRing(coordsToLinearRing(pts));
    return geomFact.createPolygon(ring);
  } catch {
    return null;
  }
}

/**
 * JSTS unary union of geometries (empty inputs filtered). For mixed fill+stroke merging.
 */
export function unionJtsGeometries(geoms: Geometry[]): Geometry | null {
  const nonempty = geoms.filter((g) => {
    const gg = g as unknown as { isEmpty(): boolean };
    return gg && !gg.isEmpty();
  });
  if (!nonempty.length) return null;
  if (nonempty.length === 1) return nonempty[0];
  const gc = geomFact.createGeometryCollection(nonempty);
  return UnaryUnionOp.union(gc) ?? null;
}

export function jtsGeometryToSvgPathD(geom: Geometry): { d: string; evenodd: boolean } {
  return geometryToPathD(geom);
}

export function strokeElementToOutlineGeometry(el: SvgElement, flatness: number): Geometry | null {
  if (!elementIsStroked(el) || hasDasharray(el)) return null;
  const tag = localTag(el);
  if (tag === "path") {
    const d = el.getAttribute("d");
    if (!d) return null;
    const subpaths = flattenPathToSubpaths(d, flatness);
    if (!subpaths.length) return null;
    return outlineGeometryFromSubpaths(subpaths, el, flatness);
  }
  if (tag === "line") {
    const subpaths = lineSubpaths(el);
    if (!subpaths.length) return null;
    return outlineGeometryFromSubpaths(subpaths, el, flatness);
  }
  if (tag === "polyline") {
    const subpaths = polylineSubpaths(el);
    if (!subpaths.length) return null;
    return outlineGeometryFromSubpaths(subpaths, el, flatness);
  }
  if (tag === "polygon") {
    const subpaths = polygonSubpaths(el);
    if (!subpaths.length) return null;
    return outlineGeometryFromSubpaths(subpaths, el, flatness);
  }
  return null;
}

export function fillElementToGeometry(el: SvgElement, flatness: number): Geometry | null {
  if (!visibleFill(el)) return null;
  const tag = localTag(el);
  if (tag === "path") {
    const d = el.getAttribute("d");
    if (!d) return null;
    const subpaths = flattenPathToSubpaths(d, flatness);
    return fillSubpathsToGeometry(subpaths, fillRuleOf(el));
  }
  if (tag === "polygon") {
    return fillSubpathsToGeometry(polygonSubpaths(el));
  }
  if (tag === "polyline") {
    return fillSubpathsToGeometry(polylineSubpaths(el));
  }
  if (tag === "rect") {
    const p = rectToFillPolygon(el);
    return p as unknown as Geometry | null;
  }
  if (tag === "circle") {
    const p = circleToFillPolygon(el);
    return p as unknown as Geometry | null;
  }
  if (tag === "ellipse") {
    const p = ellipseToFillPolygon(el);
    return p as unknown as Geometry | null;
  }
  return null;
}

function bufferSubpaths(
  subpaths: Subpath[],
  halfW: number,
  cap: number,
  join: number,
  mitre: number,
  quadSegs: number
): Geometry | null {
  const bp = new BufferParameters();
  bp.setQuadrantSegments(quadSegs);
  bp.setEndCapStyle(cap);
  bp.setJoinStyle(join);
  bp.setMitreLimit(mitre);
  const geoms: Geometry[] = [];
  for (const { coords, closed } of subpaths) {
    if (coords.length < 2) continue;
    try {
      if (closed && coords.length >= 3) {
        let c = coordsToLinearRing(coords);
        const first = c[0];
        const last = c[c.length - 1];
        if (
          Math.abs(first.x - last.x) > COORD_EPS ||
          Math.abs(first.y - last.y) > COORD_EPS
        ) {
          c = [...c, new Coordinate(first.x, first.y)];
        }
        const ring = geomFact.createLinearRing(c);
        const bufOp = new BufferOp(ring, bp);
        const g = bufOp.getResultGeometry(halfW) as unknown as { isEmpty(): boolean };
        if (!g.isEmpty()) geoms.push(g as unknown as Geometry);
      } else {
        const line = geomFact.createLineString(coordsToLinearRing(coords));
        const bufOp = new BufferOp(line, bp);
        const g = bufOp.getResultGeometry(halfW) as unknown as { isEmpty(): boolean };
        if (!g.isEmpty()) geoms.push(g as unknown as Geometry);
      }
    } catch {
      continue;
    }
  }
  if (!geoms.length) return null;
  if (geoms.length === 1) return geoms[0];
  const gc = geomFact.createGeometryCollection(geoms);
  return UnaryUnionOp.union(gc) ?? null;
}

function outlineGeometryFromSubpaths(
  subpaths: Subpath[],
  el: SvgElement,
  flatness: number
): Geometry | null {
  const sw = strokeWidthPx(el);
  if (sw <= 0) return null;
  const half = sw / 2;
  const cap = capStyle(el);
  const join = joinStyle(el);
  const mitre = mitreLimit(el);
  return bufferSubpaths(subpaths, half, cap, join, mitre, 8);
}

function outlineFromSubpaths(
  subpaths: Subpath[],
  el: SvgElement,
  flatness: number
): { d: string; evenodd: boolean } | null {
  const g = outlineGeometryFromSubpaths(subpaths, el, flatness);
  if (!g) return null;
  return geometryToPathD(g);
}

function insertAfter(parent: SvgElement, reference: SvgElement, newEl: SvgElement): void {
  const kids = elementChildren(parent);
  const idx = kids.indexOf(reference);
  const next = idx >= 0 && idx + 1 < kids.length ? kids[idx + 1] : null;
  if (next) {
    parent.insertBefore(newEl, next);
  } else {
    parent.appendChild(newEl);
  }
}

/**
 * Marks a filled shape (from mixed-icon preprocessing) whose outline should move with the
 * weight: phase 3 still assigns it a stroke width, and phase 4 offsets the fill by
 * (width − Regular width) / 2 instead of stroking it, so Regular keeps the designed shape.
 */
export const FILL_OFFSET_ATTR = "data-sf-fill-offset";

/** Smallest fraction of a part's area kept when thinning; tiny details shrink less instead of vanishing. */
const MIN_THINNED_AREA_RATIO = 0.25;
/** Sliver-cleanup radius as a fraction of the fill's bounding-box diagonal. */
const SLIVER_RATIO = 0.002;

function offsetFillGeometry(g: Geometry, delta: number): Geometry {
  if (Math.abs(delta) < 1e-9) return g;
  const bp = new BufferParameters();
  bp.setQuadrantSegments(8);
  bp.setJoinStyle(BufferParameters.JOIN_MITRE);
  bp.setMitreLimit(1.5);
  const buffer = (geom: Geometry, dist: number) =>
    new BufferOp(geom, bp).getResultGeometry(dist) as unknown as Geometry & {
      isEmpty(): boolean;
      getArea(): number;
    };
  // Outlined-stroke exports leave hair-thin slivers and cracks at joins; a mitred offset
  // blows each one up into a visible block, so close then open by a tiny radius first.
  const env = (g as unknown as {
    getEnvelopeInternal(): { getWidth(): number; getHeight(): number };
  }).getEnvelopeInternal();
  const eps = Math.hypot(env.getWidth(), env.getHeight()) * SLIVER_RATIO;
  const closed = buffer(buffer(g, eps), -eps);
  const opened = buffer(buffer(closed, -eps), eps);
  if (!opened.isEmpty()) g = opened;

  if (delta > 0) return buffer(g, delta);

  const parts = g as unknown as { getNumGeometries(): number; getGeometryN(i: number): Geometry };
  const out: Geometry[] = [];
  for (let i = 0; i < parts.getNumGeometries(); i++) {
    const part = parts.getGeometryN(i);
    const area = (part as unknown as { getArea(): number }).getArea();
    let kept: Geometry = part;
    for (const f of [1, 0.75, 0.5, 0.25]) {
      const thinned = buffer(part, delta * f);
      if (!thinned.isEmpty() && thinned.getArea() >= area * MIN_THINNED_AREA_RATIO) {
        kept = thinned;
        break;
      }
    }
    out.push(kept);
  }
  return unionJtsGeometries(out) ?? g;
}

function convertFillOffsetElement(
  el: SvgElement,
  flatness: number,
  regularStrokeWidth: number | undefined
): boolean {
  const d = el.getAttribute("d");
  if (!d) return false;
  const g = fillSubpathsToGeometry(flattenPathToSubpaths(d, flatness), fillRuleOf(el));
  if (!g) return false;
  // Strokes are reset to absolute per-weight widths, so a fill drawn alongside source strokes
  // of width w moves its edges by (target - w) / 2 to keep every line in a weight equal.
  const sourceWidth = parseFloat(el.getAttribute(SOURCE_STROKE_WIDTH_ATTR) ?? "");
  const baseWidth = Number.isFinite(sourceWidth) && sourceWidth > 0 ? sourceWidth : regularStrokeWidth;
  const delta = baseWidth === undefined ? 0 : (strokeWidthPx(el) - baseWidth) / 2;
  const out = geometryToPathD(offsetFillGeometry(g, delta));
  if (!out.d) return false;
  const paint = strokePaint(el);
  el.removeAttribute(FILL_OFFSET_ATTR);
  el.removeAttribute(SOURCE_STROKE_WIDTH_ATTR);
  el.setAttribute("d", out.d);
  el.setAttribute("fill", paint);
  if (out.evenodd) el.setAttribute("fill-rule", "evenodd");
  else el.removeAttribute("fill-rule");
  stripStrokePresentation(el);
  return true;
}

function convertPathElement(
  el: SvgElement,
  parent: SvgElement,
  flatness: number,
  doc: SvgDocument,
  regularStrokeWidth?: number
): boolean {
  if (!elementIsStroked(el) || hasDasharray(el)) return false;
  if (el.getAttribute(FILL_OFFSET_ATTR) !== null) {
    return convertFillOffsetElement(el, flatness, regularStrokeWidth);
  }
  const d = el.getAttribute("d");
  if (!d) return false;
  const subpaths = flattenPathToSubpaths(d, flatness);
  if (!subpaths.length) return false;
  const out = outlineFromSubpaths(subpaths, el, flatness);
  if (!out || !out.d) return false;
  const { d: pathD, evenodd } = out;
  const paint = strokePaint(el);
  const hasFill = visibleFill(el);

  if (hasFill) {
    const outline = doc.createElementNS(SVG_NS, "path");
    outline.setAttribute("d", pathD);
    outline.setAttribute("fill", paint);
    if (evenodd) outline.setAttribute("fill-rule", "evenodd");
    insertAfter(parent, el, outline);
    stripStrokePresentation(el);
  } else {
    el.setAttribute("d", pathD);
    el.setAttribute("fill", paint);
    if (evenodd) el.setAttribute("fill-rule", "evenodd");
    stripStrokePresentation(el);
  }
  return true;
}

function lineSubpaths(el: SvgElement): Subpath[] {
  try {
    const x1 = parseFloat(el.getAttribute("x1") || "0");
    const y1 = parseFloat(el.getAttribute("y1") || "0");
    const x2 = parseFloat(el.getAttribute("x2") || "0");
    const y2 = parseFloat(el.getAttribute("y2") || "0");
    return [{ coords: [[x1, y1], [x2, y2]], closed: false }];
  } catch {
    return [];
  }
}

function polylineSubpaths(el: SvgElement): Subpath[] {
  const pts = parsePointsAttr(el.getAttribute("points"));
  if (pts.length < 2) return [];
  return [{ coords: pts, closed: false }];
}

function polygonSubpaths(el: SvgElement): Subpath[] {
  const pts = parsePointsAttr(el.getAttribute("points"));
  if (pts.length < 3) return [];
  return [{ coords: pts, closed: true }];
}

function replaceWithPath(
  parent: SvgElement,
  el: SvgElement,
  d: string,
  evenodd: boolean,
  doc: SvgDocument
): SvgElement {
  const newEl = doc.createElementNS(SVG_NS, "path");
  newEl.setAttribute("d", d);
  if (evenodd) newEl.setAttribute("fill-rule", "evenodd");
  parent.replaceChild(newEl, el);
  return newEl;
}

function convertLineLikeElementSimple(
  el: SvgElement,
  parent: SvgElement,
  tag: string,
  flatness: number,
  doc: SvgDocument
): boolean {
  if (!elementIsStroked(el) || hasDasharray(el)) return false;
  if (visibleFill(el)) return false;
  let subpaths: Subpath[];
  if (tag === "line") subpaths = lineSubpaths(el);
  else if (tag === "polyline") subpaths = polylineSubpaths(el);
  else if (tag === "polygon") subpaths = polygonSubpaths(el);
  else return false;
  const out = outlineFromSubpaths(subpaths, el, flatness);
  if (!out || !out.d) return false;
  const newEl = replaceWithPath(parent, el, out.d, out.evenodd, doc);
  newEl.setAttribute("fill", strokePaint(el));
  return true;
}

const SHAPE_GEOMETRY_ATTRS = new Set(["x", "y", "width", "height", "rx", "ry", "cx", "cy", "r"]);

function shapeElementToPath(el: SvgElement, parent: SvgElement, doc: SvgDocument): SvgElement | null {
  const d = shapeToPathD(el);
  if (!d) return null;
  const p = doc.createElementNS(SVG_NS, "path");
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i];
    if (!SHAPE_GEOMETRY_ATTRS.has(a.name)) p.setAttribute(a.name, a.value);
  }
  p.setAttribute("d", d);
  parent.replaceChild(p, el);
  return p;
}

function parentMap(root: SvgElement): Map<SvgElement, SvgElement> {
  const m = new Map<SvgElement, SvgElement>();
  const walk = (el: SvgElement) => {
    for (const c of elementChildren(el)) {
      m.set(c, el);
      walk(c);
    }
  };
  walk(root);
  return m;
}

function collectElements(root: SvgElement): SvgElement[] {
  const all: SvgElement[] = [];
  const walk = (el: SvgElement) => {
    all.push(el);
    for (const c of elementChildren(el)) walk(c);
  };
  walk(root);
  return all;
}

export function expandStrokesInTree(
  root: SvgElement,
  flatness = 1,
  opts: { regularStrokeWidth?: number } = {}
): number {
  const doc = root.ownerDocument as SvgDocument | null;
  if (!doc) throw new Error("expandStrokesInTree: missing ownerDocument");
  let converted = 0;
  let changed = true;
  while (changed) {
    changed = false;
    const pmap = parentMap(root);
    for (const el of collectElements(root)) {
      const tag = localTag(el);
      const parent = pmap.get(el);
      if (parent === undefined) continue;
      if (tag === "path") {
        if (convertPathElement(el, parent, flatness, doc, opts.regularStrokeWidth)) {
          converted++;
          changed = true;
        }
      } else if (tag === "rect" || tag === "circle" || tag === "ellipse") {
        if (!elementIsStroked(el) || hasDasharray(el)) continue;
        const asPath = shapeElementToPath(el, parent, doc);
        if (asPath && convertPathElement(asPath, parent, flatness, doc, opts.regularStrokeWidth)) {
          converted++;
          changed = true;
        }
      } else if (tag === "line") {
        if (convertLineLikeElementSimple(el, parent, tag, flatness, doc)) {
          converted++;
          changed = true;
        }
      } else if (tag === "polyline") {
        if (convertLineLikeElementSimple(el, parent, tag, flatness, doc)) {
          converted++;
          changed = true;
        }
      } else if (tag === "polygon") {
        if (convertLineLikeElementSimple(el, parent, tag, flatness, doc)) {
          converted++;
          changed = true;
        }
      }
    }
  }
  return converted;
}

function fillPaint(el: SvgElement): string {
  const f = el.getAttribute("fill");
  if (f) return f.trim().toLowerCase();
  const style = el.getAttribute("style");
  return (style ? parseStyle(style).fill : "")?.trim().toLowerCase() ?? "";
}

const MERGE_FLATNESS = 0.05;
const MERGE_TAGS = new Set(["path", "rect", "circle", "ellipse", "polygon", "polyline"]);

/**
 * Union same-colour filled shapes that overlap into one path. SF Symbols combines a layer's
 * paths so that overlaps cancel out, which turns e.g. a fill plus its outlined stroke into
 * a hollow double outline; browsers paint them additively, so the template looks fine.
 */
export function mergeOverlappingFills(root: SvgElement): number {
  const pmap = parentMap(root);
  const items: { el: SvgElement; g: Geometry; paint: string }[] = [];
  for (const el of collectElements(root)) {
    if (!MERGE_TAGS.has(localTag(el)) || elementIsStroked(el)) continue;
    const g = fillElementToGeometry(el, MERGE_FLATNESS);
    if (!g || (g as unknown as { isEmpty(): boolean }).isEmpty()) continue;
    items.push({ el, g, paint: fillPaint(el) });
  }
  const group = items.map((_, i) => i);
  const find = (i: number): number => (group[i] === i ? i : (group[i] = find(group[i])));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].paint !== items[j].paint || find(i) === find(j)) continue;
      const overlap = OverlayOp.intersection(items[i].g, items[j].g) as unknown as { getArea(): number };
      if (overlap.getArea() > 0) group[find(j)] = find(i);
    }
  }
  const clusters = new Map<number, number[]>();
  items.forEach((_, i) => {
    const r = find(i);
    clusters.set(r, [...(clusters.get(r) ?? []), i]);
  });
  let merged = 0;
  for (const members of clusters.values()) {
    if (members.length < 2) continue;
    const union = unionJtsGeometries(members.map((i) => items[i].g));
    if (!union) continue;
    const { d, evenodd } = geometryToPathD(union);
    if (!d) continue;
    const first = items[members[0]].el;
    const parent = pmap.get(first);
    if (!parent) continue;
    const doc = root.ownerDocument as SvgDocument;
    const path = doc.createElementNS(SVG_NS, "path") as unknown as SvgElement;
    path.setAttribute("d", d);
    path.setAttribute("fill", items[members[0]].paint);
    if (evenodd) path.setAttribute("fill-rule", "evenodd");
    parent.insertBefore(path, first);
    for (const i of members) pmap.get(items[i].el)?.removeChild(items[i].el);
    merged += members.length;
  }
  return merged;
}

function processWeightSvgPhase4(path: string, flatness: number, regularStrokeWidth?: number): number {
  const doc = parseSvgFile(path);
  const svgRoot = svgDocumentElement(doc);
  const n = expandStrokesInTree(svgRoot, flatness, { regularStrokeWidth });
  mergeOverlappingFills(svgRoot);
  writeFileSync(path, elementToBytes(svgRoot));
  return n;
}

export function runPhase4(outputDir: PathLike, flatness = 1): Record<string, number> {
  const dir = String(outputDir);
  const results: Record<string, number> = {};
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".svg")).sort()) {
    if (name === "original.svg") continue;
    const stem = name.replace(/\.svg$/i, "");
    const parsed = parseWeightStem(stem);
    if (!parsed) continue;
    const full = join(dir, name);
    const regular = STROKE_WIDTH_BY_WEIGHT_SUFFIX[`Regular-${parsed[1]}`];
    results[stem] = processWeightSvgPhase4(full, flatness, regular);
  }
  return results;
}
