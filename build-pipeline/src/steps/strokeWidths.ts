import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PathLike } from "node:fs";
import { SF_SYMBOL_WEIGHTS } from "./weightReplicas.js";
import {
  elementChildren,
  elementToBytes,
  localTag,
  parseSvgFile,
  svgDocumentElement,
  type SvgElement,
} from "../svg/xml.js";

export const STROKE_WIDTH_BY_WEIGHT_SUFFIX: Record<string, number> = {
  "Ultralight-L": 2.5,
  "Thin-L": 4.25,
  "Light-L": 7.0,
  "Regular-L": 9.125,
  "Medium-L": 11.0,
  "Semibold-L": 13.0,
  "Bold-L": 14.75,
  "Heavy-L": 17.75,
  "Black-L": 21.0,
  "Ultralight-M": 2.4,
  "Thin-M": 4.0,
  "Light-M": 6.5,
  "Regular-M": 8.0,
  "Medium-M": 10.125,
  "Semibold-M": 11.5,
  "Bold-M": 13.25,
  "Heavy-M": 16.0,
  "Black-M": 18.0,
  "Ultralight-S": 2.25,
  "Thin-S": 3.5,
  "Light-S": 6.0,
  "Regular-S": 7.5,
  "Medium-S": 8.75,
  "Semibold-S": 9.5,
  "Bold-S": 11.0,
  "Heavy-S": 12.5,
  "Black-S": 14.25,
};

const _STROKEABLE_TAGS = new Set([
  "path",
  "line",
  "polyline",
  "polygon",
  "circle",
  "ellipse",
  "rect",
]);

const _WEIGHT_STEMS = new Set<string>(SF_SYMBOL_WEIGHTS);

export function parseWeightStem(stem: string): [string, string] | null {
  const i = stem.lastIndexOf("-");
  if (i < 0) return null;
  const weight = stem.slice(0, i);
  const suffix = stem.slice(i + 1);
  if (suffix !== "L" && suffix !== "M" && suffix !== "S") return null;
  if (!_WEIGHT_STEMS.has(weight)) return null;
  return [weight, suffix];
}

function parseStyle(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of style.split(";")) {
    const p = part.trim();
    if (!p || !p.includes(":")) continue;
    const [k, ...rest] = p.split(":");
    const key = k.trim().toLowerCase();
    out[key] = rest.join(":").trim();
  }
  return out;
}

function formatStyle(props: Record<string, string>): string {
  return Object.entries(props)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}

function strokeColorPresent(props: Record<string, string>): boolean {
  const s = (props.stroke || "").trim().toLowerCase();
  return Boolean(s) && s !== "none" && s !== "transparent";
}

export function elementIsStroked(el: SvgElement): boolean {
  if (!_STROKEABLE_TAGS.has(localTag(el))) return false;
  const strokeAttr = el.getAttribute("stroke");
  if (strokeAttr !== null) {
    const sa = strokeAttr.trim().toLowerCase();
    if (sa && sa !== "none" && sa !== "transparent") return true;
  }
  const style = el.getAttribute("style");
  if (style) {
    const sd = parseStyle(style);
    if (strokeColorPresent(sd)) return true;
    for (const k of ["stroke-linecap", "stroke-linejoin", "stroke-dasharray"]) {
      if (sd[k]) return true;
    }
  }
  return false;
}

function formatStrokeWidth(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function applyStrokeWidth(el: SvgElement, width: number): void {
  const wstr = formatStrokeWidth(width);
  const style = el.getAttribute("style");
  if (style) {
    const sd = parseStyle(style);
    sd["stroke-width"] = wstr;
    el.setAttribute("style", formatStyle(sd));
    el.removeAttribute("stroke-width");
  } else {
    el.setAttribute("stroke-width", wstr);
  }
}

export function applyStrokeWidthsToTree(root: SvgElement, width: number): number {
  let n = 0;
  const walk = (el: SvgElement) => {
    if (elementIsStroked(el)) {
      applyStrokeWidth(el, width);
      n++;
    }
    for (const c of elementChildren(el)) {
      walk(c);
    }
  };
  walk(root);
  return n;
}

function processWeightSvg(path: string, strokeWidth: number): number {
  const doc = parseSvgFile(path);
  const svgRoot = svgDocumentElement(doc);
  const count = applyStrokeWidthsToTree(svgRoot, strokeWidth);
  writeFileSync(path, elementToBytes(svgRoot));
  return count;
}

export function runStrokeWidths(outputDir: PathLike): Record<string, number> {
  const dir = String(outputDir);
  const results: Record<string, number> = {};
  const names = readdirSync(dir).filter((f) => f.endsWith(".svg")).sort();
  for (const name of names) {
    if (name === "original.svg") continue;
    const stem = name.replace(/\.svg$/i, "");
    const parsed = parseWeightStem(stem);
    if (!parsed) continue;
    const key = `${parsed[0]}-${parsed[1]}`;
    const sw = STROKE_WIDTH_BY_WEIGHT_SUFFIX[key];
    if (sw === undefined) continue;
    const full = join(dir, name);
    results[stem] = processWeightSvg(full, sw);
  }
  return results;
}
