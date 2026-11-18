import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import type { PathLike } from "node:fs";
import { join } from "node:path";
import { bakeVisualSubtree, buildPhase1BakeMatrix } from "./svgAffineBake.js";
import {
  deepCloneElement,
  elementChildren,
  elementToBytes,
  localTag,
  materializeInheritedFill,
  parseSvgFile,
  parseSvgXml,
  svgDocumentElement,
  type SvgElement,
} from "./xml.js";

const _FLOAT_RE = /^[-+]?(?:\d*\.?\d+(?:[eE][-+]?\d+)?)$/;

function parseLength(value: string | null): number | null {
  if (value === null) return null;
  let v = value.trim();
  for (const suffix of ["px", "pt", "pc", "mm", "cm", "in"]) {
    if (v.toLowerCase().endsWith(suffix)) {
      v = v.slice(0, -suffix.length).trim();
      break;
    }
  }
  if (!v || v.endsWith("%")) return null;
  if (!_FLOAT_RE.test(v)) return null;
  return parseFloat(v);
}

function parseViewBox(raw: string | null): [number, number, number, number] | null {
  if (!raw) return null;
  const parts = raw.trim().split(/[,\s]+/).filter(Boolean);
  const nums: number[] = [];
  for (const p of parts) {
    const n = parseFloat(p);
    if (Number.isNaN(n)) return null;
    nums.push(n);
  }
  if (nums.length !== 4) return null;
  const [x, y, w, h] = nums;
  if (w <= 0 || h <= 0) return null;
  return [x, y, w, h];
}

export interface SizeVariant {
  name: string;
  sidePx: number;
}

/** SF Symbols scale factors relative to Medium (Apple "Creating custom symbols"). */
export const MEDIUM_SIDE_PX = 136;
export const SMALL_SCALE_FACTOR = 0.783;
export const LARGE_SCALE_FACTOR = 1.29;
export const SMALL_SIDE_PX = Math.round(MEDIUM_SIDE_PX * SMALL_SCALE_FACTOR * 1000) / 1000;
export const LARGE_SIDE_PX = Math.round(MEDIUM_SIDE_PX * LARGE_SCALE_FACTOR * 1000) / 1000;

export const PHASE1_VARIANTS: SizeVariant[] = [
  { name: "large", sidePx: LARGE_SIDE_PX },
  { name: "medium", sidePx: MEDIUM_SIDE_PX },
  { name: "small", sidePx: SMALL_SIDE_PX },
];

export function readViewBox(svgRoot: SvgElement): [number, number, number, number] {
  const vb = parseViewBox(svgRoot.getAttribute("viewBox"));
  if (vb) return vb;
  const w = parseLength(svgRoot.getAttribute("width"));
  const h = parseLength(svgRoot.getAttribute("height"));
  if (w !== null && h !== null && w > 0 && h > 0) return [0, 0, w, h];
  throw new Error(
    "SVG root must have a valid viewBox or numeric width and height (px or unitless)."
  );
}

function partitionVisualChildren(svgRoot: SvgElement): [SvgElement[], SvgElement[]] {
  const defsNodes: SvgElement[] = [];
  const other: SvgElement[] = [];
  for (const child of elementChildren(svgRoot)) {
    if (localTag(child) === "defs") defsNodes.push(child);
    else other.push(child);
  }
  return [defsNodes, other];
}

/**
 * Stroke width (in source units) that a fill-only shape stands in for. Scaled with the
 * geometry here so phase 4 can offset the fill to the same per-weight width as real strokes.
 */
export const SOURCE_STROKE_WIDTH_ATTR = "data-sf-source-stroke-width";

function scaleSourceStrokeWidths(el: SvgElement, s: number): void {
  const raw = el.getAttribute(SOURCE_STROKE_WIDTH_ATTR);
  if (raw) {
    const w = parseFloat(raw);
    if (Number.isFinite(w)) el.setAttribute(SOURCE_STROKE_WIDTH_ATTR, String(w * s));
  }
  for (const c of elementChildren(el)) scaleSourceStrokeWidths(c, s);
}

export function buildVariantSvg(svgRoot: SvgElement, sidePx: number): SvgElement {
  const [ox, oy, ow, oh] = readViewBox(svgRoot);
  const root = deepCloneElement(svgRoot);
  materializeInheritedFill(root);

  const [defsNodes, other] = partitionVisualChildren(root);
  for (const ch of [...elementChildren(root)]) {
    root.removeChild(ch);
  }
  for (const d of defsNodes) {
    root.appendChild(d);
  }

  const s = Math.min(sidePx / ow, sidePx / oh);
  const tx = (sidePx - ow * s) / 2;
  const ty = (sidePx - oh * s) / 2;
  const m = buildPhase1BakeMatrix(s, ox, oy, tx, ty);
  for (const node of other) {
    bakeVisualSubtree(node, m);
    scaleSourceStrokeWidths(node, s);
    root.appendChild(node);
  }

  root.setAttribute("viewBox", `0 0 ${sidePx} ${sidePx}`);
  root.setAttribute("width", String(sidePx));
  root.setAttribute("height", String(sidePx));
  return root;
}

export function runPhase1(
  inputPath: PathLike,
  outputDir: PathLike,
  options: { originalName?: string } = {}
): Record<string, string> {
  const originalName = options.originalName ?? "original.svg";
  mkdirSync(outputDir, { recursive: true });
  const outDir = String(outputDir);
  const origOut = join(outDir, originalName);
  copyFileSync(inputPath, origOut);

  const doc = parseSvgFile(inputPath);
  const svgRoot = svgDocumentElement(doc);
  const written: Record<string, string> = { original: origOut };

  for (const v of PHASE1_VARIANTS) {
    const variantRoot = buildVariantSvg(svgRoot, v.sidePx);
    const outPath = join(outDir, `${v.name}.svg`);
    writeFileSync(outPath, elementToBytes(variantRoot));
    written[v.name] = outPath;
  }

  return written;
}

/** Parse SVG string to root element (for tests). */
export function parseSvgString(xml: string): SvgElement {
  const doc = parseSvgXml(xml);
  return svgDocumentElement(doc);
}
