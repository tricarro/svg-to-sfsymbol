/**
 * Merge a filled (non-stroked) icon into resources/square_variable_template.svg layout.
 * Reads template from disk once; never writes the source template file.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import SvgPath from "svgpath";
import type Geometry from "jsts/org/locationtech/jts/geom/Geometry.js";
import { formatCoord } from "./curveFit.js";
import { offsetFilledPathD, type FillRule } from "./pathOffset.js";
import { buildVariantSvg, readViewBox, SMALL_SIDE_PX } from "./phase1.js";
import { STROKE_WIDTH_BY_WEIGHT_SUFFIX } from "./phase3.js";
import { fillElementToGeometry, unionJtsGeometries } from "./phase4.js";
import {
  bboxCenter,
  elementsBBox,
  MARGIN_PADDING_RATIO,
  shapeToPathD,
  writeMarginGuides,
} from "./slotLayout.js";
import {
  elementChildren,
  elementToBytes,
  localTag,
  parseSvgFile,
  parseSvgXml,
  SVG_NS,
  svgDocumentElement,
  type SvgDocument,
  type SvgElement,
} from "./xml.js";

const WIREFRAME_CLASS = "SFSymbolsPreviewWireframe";
const VARIABLE_SLOT_IDS = ["Ultralight-S", "Regular-S", "Black-S"] as const;
const ENV_VARIABLE_TEMPLATE = "SFSYMBOL_VARIABLE_TEMPLATE_PATH";

const SHAPE_TAGS = new Set(["path", "rect", "circle", "ellipse", "polygon", "polyline"]);
const SHAPE_GEOMETRY_ATTRS = ["d", "x", "y", "width", "height", "rx", "ry", "cx", "cy", "r", "points"];

/**
 * Outline offset for a slot, in normalized icon units. The artwork as drawn is Regular-S;
 * its line thickness (estimated as 2·area/perimeter, capped at the Regular-S stroke width)
 * is scaled by the stroke-table ratio for the slot's weight.
 */
function slotOffset(slotId: string, thickness: number): number {
  const regular = STROKE_WIDTH_BY_WEIGHT_SUFFIX["Regular-S"];
  const target = STROKE_WIDTH_BY_WEIGHT_SUFFIX[slotId] ?? regular;
  const t = Math.min(thickness, regular);
  return (t / 2) * (target / regular - 1);
}

function estimateLineThickness(nodes: SvgElement[]): number {
  const geoms: Geometry[] = [];
  const walk = (el: SvgElement) => {
    if (localTag(el) === "path") {
      const g = fillElementToGeometry(el, 0.5);
      if (g) geoms.push(g);
    }
    for (const c of elementChildren(el)) walk(c);
  };
  nodes.forEach(walk);
  const all = unionJtsGeometries(geoms) as unknown as { getArea(): number; getLength(): number } | null;
  if (!all || all.getLength() <= 0) return STROKE_WIDTH_BY_WEIGHT_SUFFIX["Regular-S"];
  return (2 * all.getArea()) / all.getLength();
}

function fillRuleOf(el: SvgElement): FillRule {
  let raw = el.getAttribute("fill-rule") ?? "";
  if (!raw) {
    const m = /fill-rule\s*:\s*([a-z]+)/i.exec(el.getAttribute("style") ?? "");
    raw = m ? m[1] : "";
  }
  return raw.trim().toLowerCase() === "evenodd" ? "evenodd" : "nonzero";
}

function ownFill(el: SvgElement): string | null {
  const a = el.getAttribute("fill");
  if (a !== null && a.trim()) return a.trim().toLowerCase();
  const m = /(?:^|;)\s*fill\s*:\s*([^;]+)/i.exec(el.getAttribute("style") ?? "");
  return m ? m[1].trim().toLowerCase() : null;
}

/**
 * Replace rect/circle/ellipse/polygon/polyline with equivalent <path> elements and drop shapes
 * whose (inherited) fill is none, since SF Symbols counts hidden paths as outlines.
 */
function shapesToPaths(el: SvgElement, doc: SvgDocument, inheritedFill: string | null = ownFill(el)): void {
  for (const ch of [...elementChildren(el)]) {
    const tag = localTag(ch);
    const fill = ownFill(ch) ?? inheritedFill;
    if (SHAPE_TAGS.has(tag) && (fill === "none" || fill === "transparent")) {
      el.removeChild(ch);
      continue;
    }
    if (SHAPE_TAGS.has(tag) && tag !== "path") {
      const d = shapeToPathD(ch);
      if (!d) continue;
      const p = doc.createElementNS(SVG_NS, "path");
      for (let i = 0; i < ch.attributes.length; i++) {
        const a = ch.attributes[i];
        if (!SHAPE_GEOMETRY_ATTRS.includes(a.name)) p.setAttribute(a.name, a.value);
      }
      p.setAttribute("d", d);
      el.replaceChild(p, ch);
    } else {
      shapesToPaths(ch, doc, fill);
    }
  }
}

function offsetPathsInTree(el: SvgElement, delta: number): void {
  if (localTag(el) === "path") {
    const d = el.getAttribute("d");
    if (d) el.setAttribute("d", offsetFilledPathD(d, delta, fillRuleOf(el)));
  }
  for (const c of elementChildren(el)) offsetPathsInTree(c, delta);
}

function expandUser(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

function repoRootFromModule(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..");
}

export function defaultVariableTemplatePath(): string | null {
  const candidate = join(repoRootFromModule(), "resources", "square_variable_template.svg");
  return existsSync(candidate) ? candidate : null;
}

export function resolveVariableTemplatePath(): string {
  const raw = process.env[ENV_VARIABLE_TEMPLATE];
  if (raw) {
    const p = resolve(expandUser(raw.trim()));
    if (!existsSync(p)) {
      throw new Error(`${ENV_VARIABLE_TEMPLATE} is set but file not found: ${p}`);
    }
    return p;
  }
  const def = defaultVariableTemplatePath();
  if (!def) {
    throw new Error(
      `No SF Symbol variable template found. Set ${ENV_VARIABLE_TEMPLATE} to the template file path, ` +
        "or add resources/square_variable_template.svg at the repository root."
    );
  }
  return def;
}

function findSymbolsGroup(root: SvgElement): SvgElement {
  const walk = (el: SvgElement): SvgElement | null => {
    if (localTag(el) === "g" && el.getAttribute("id") === "Symbols") return el;
    for (const c of elementChildren(el)) {
      const f = walk(c);
      if (f) return f;
    }
    return null;
  };
  const g = walk(root);
  if (!g) throw new Error('No <g id="Symbols"> found in variable template.');
  return g;
}

function ensureTemplateDefs(svgRoot: SvgElement): SvgElement {
  for (const ch of elementChildren(svgRoot)) {
    if (localTag(ch) === "defs") return ch;
  }
  const doc = svgRoot.ownerDocument;
  if (!doc) throw new Error("template svg has no owner document");
  const defs = doc.createElementNS(SVG_NS, "defs");
  svgRoot.insertBefore(defs, svgRoot.firstChild);
  return defs;
}

function pathBBoxFromD(d: string): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  let p: InstanceType<typeof SvgPath>;
  try {
    p = new SvgPath(d).abs().unshort().unarc();
  } catch {
    throw new Error(`Degenerate wireframe bbox: unparseable d`);
  }
  let cx = 0;
  let cy = 0;
  for (const s of (p as unknown as { segments: (string | number)[][] }).segments) {
    const cmd = String(s[0]);
    if (cmd === "M" || cmd === "m") {
      cx = Number(s[1]);
      cy = Number(s[2]);
      add(cx, cy);
    } else if (cmd === "L" || cmd === "l" || cmd === "T" || cmd === "t") {
      cx = Number(s[s.length - 2]);
      cy = Number(s[s.length - 1]);
      add(cx, cy);
    } else if (cmd === "H" || cmd === "h") {
      cx = Number(s[1]);
      add(cx, cy);
    } else if (cmd === "V" || cmd === "v") {
      cy = Number(s[1]);
      add(cx, cy);
    } else if (cmd === "C" || cmd === "c") {
      add(Number(s[1]), Number(s[2]));
      add(Number(s[3]), Number(s[4]));
      cx = Number(s[5]);
      cy = Number(s[6]);
      add(cx, cy);
    } else if (cmd === "Q" || cmd === "q") {
      add(Number(s[1]), Number(s[2]));
      cx = Number(s[3]);
      cy = Number(s[4]);
      add(cx, cy);
    } else if (cmd === "Z" || cmd === "z") {
      /* close */
    }
  }
  const bw = maxX - minX;
  const bh = maxY - minY;
  if (bw <= 0 || bh <= 0) {
    throw new Error(`Degenerate wireframe bbox from path d=${d.slice(0, 80)}…`);
  }
  return [minX, minY, bw, bh];
}

function classHasWireframe(classAttr: string | null): boolean {
  if (!classAttr) return false;
  return classAttr.split(/\s+/).includes(WIREFRAME_CLASS);
}

function partitionIconChildren(iconRoot: SvgElement): [SvgElement[], SvgElement[]] {
  const defsNodes: SvgElement[] = [];
  const other: SvgElement[] = [];
  for (const ch of elementChildren(iconRoot)) {
    if (localTag(ch) === "defs") defsNodes.push(ch);
    else other.push(ch);
  }
  return [defsNodes, other];
}

function mergeIconDefsInto(
  templateDefs: SvgElement,
  defsElements: SvgElement[],
  templateDoc: SvgDocument
): void {
  const existingIds = new Set<string>();
  const collectIds = (el: SvgElement) => {
    const id = el.getAttribute("id");
    if (id) existingIds.add(id);
    for (const c of elementChildren(el)) collectIds(c);
  };
  collectIds(templateDefs);

  for (const defsEl of defsElements) {
    for (const child of [...elementChildren(defsEl)]) {
      const cid = child.getAttribute("id");
      if (cid !== null && existingIds.has(cid)) continue;
      const imported = templateDoc.importNode(child, true);
      templateDefs.appendChild(imported);
      if (cid !== null) existingIds.add(cid);
    }
  }
}

function findSlot(symbols: SvgElement, slotId: string): SvgElement | null {
  for (const ch of elementChildren(symbols)) {
    if (localTag(ch) !== "g") continue;
    if (ch.getAttribute("id") === slotId) return ch;
  }
  return null;
}

function fillSlotWithVisuals(
  slot: SvgElement,
  visual: SvgElement[],
  templateDoc: SvgDocument,
  templateRoot: SvgElement,
  slotId: string,
  delta: number,
  side: number
): void {
  let wire: SvgElement | null = null;
  for (const child of elementChildren(slot)) {
    if (localTag(child) !== "path") continue;
    if (classHasWireframe(child.getAttribute("class"))) {
      wire = child;
      break;
    }
  }
  if (!wire) {
    throw new Error(`Slot <g id="${slot.getAttribute("id")}"> has no ${WIREFRAME_CLASS} path.`);
  }
  const d = wire.getAttribute("d");
  if (!d) {
    throw new Error(`Wireframe path in slot ${slot.getAttribute("id")} has no d.`);
  }
  const [bx, by, bw, bh] = pathBBoxFromD(d);

  const nodes = visual.map((node) => templateDoc.importNode(node, true) as SvgElement);
  for (const n of nodes) offsetPathsInTree(n, delta);
  const art = elementsBBox(nodes) ?? { minX: 0, minY: 0, maxX: side, maxY: side };
  const [cxArt, cyArt] = bboxCenter(art);
  const tx = bx + bw / 2 - cxArt;
  const ty = by + bh / 2 - cyArt;

  slot.removeChild(wire);

  const wrap = templateDoc.createElementNS(SVG_NS, "g");
  wrap.setAttribute("transform", `translate(${formatCoord(tx)} ${formatCoord(ty)})`);
  for (const n of nodes) wrap.appendChild(n);
  slot.appendChild(wrap);

  const placed = { minX: art.minX + tx, minY: art.minY + ty, maxX: art.maxX + tx, maxY: art.maxY + ty };
  writeMarginGuides(templateRoot, slot, slotId, placed, side * MARGIN_PADDING_RATIO);
}

/**
 * Build merged variable-template SVG bytes. Does not write `square_variable_template.svg`.
 */
export function mergeFilledIconIntoVariableTemplate(
  iconSvgXml: string,
  opts: { templatePath?: string } = {}
): Buffer {
  const templatePath = opts.templatePath ?? resolveVariableTemplatePath();

  const iconDoc = parseSvgXml(iconSvgXml);
  const iconRootOrig = svgDocumentElement(iconDoc);
  const normalizedRoot = buildVariantSvg(iconRootOrig, SMALL_SIDE_PX);

  const [, , sw, sh] = readViewBox(normalizedRoot);
  if (sw <= 0 || sh <= 0) {
    throw new Error("Invalid normalized icon viewBox dimensions.");
  }
  if (!normalizedRoot.ownerDocument) throw new Error("normalized icon has no owner document");
  shapesToPaths(normalizedRoot, normalizedRoot.ownerDocument);

  const [defsNodes, visual] = partitionIconChildren(normalizedRoot);
  const thickness = estimateLineThickness(visual);

  const templateDoc = parseSvgFile(templatePath);
  const templateRoot = svgDocumentElement(templateDoc);
  const symbols = findSymbolsGroup(templateRoot);

  if (defsNodes.length) {
    mergeIconDefsInto(ensureTemplateDefs(templateRoot), defsNodes, templateDoc);
  }

  for (const id of VARIABLE_SLOT_IDS) {
    const slot = findSlot(symbols, id);
    if (!slot) {
      throw new Error(`Variable template missing required slot <g id="${id}">.`);
    }
    fillSlotWithVisuals(slot, visual, templateDoc, templateRoot, id, slotOffset(id, thickness), sw);
  }

  return elementToBytes(templateRoot);
}
