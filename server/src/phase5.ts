import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import type { PathLike } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import SvgPath from "svgpath";
import { readViewBox } from "./phase1.js";
import { PHASE2_SIZE_SUFFIX, PHASE2_WEIGHTS } from "./phase2.js";
import { parseWeightStem } from "./phase3.js";
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

const WIREFRAME_CLASS = "SFSymbolsPreviewWireframe";

export type MissingPolicy = "skip" | "warn" | "fail";

function repoRootFromModule(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..");
}

export function defaultSquareTemplatePath(): string | null {
  const candidate = join(repoRootFromModule(), "resources", "square_template.svg");
  return existsSync(candidate) ? candidate : null;
}

function expectedSlotIds(): Set<string> {
  const s = new Set<string>();
  for (const w of PHASE2_WEIGHTS) {
    for (const [, suf] of PHASE2_SIZE_SUFFIX) {
      s.add(`${w}-${suf}`);
    }
  }
  return s;
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
  if (!g) throw new Error('No <g id="Symbols"> found in template.');
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

function partitionIconChildren(iconRoot: SvgElement): [SvgElement[], SvgElement[]] {
  const defsNodes: SvgElement[] = [];
  const other: SvgElement[] = [];
  for (const ch of elementChildren(iconRoot)) {
    if (localTag(ch) === "defs") defsNodes.push(ch);
    else other.push(ch);
  }
  return [defsNodes, other];
}

function classHasWireframe(classAttr: string | null): boolean {
  if (!classAttr) return false;
  return classAttr.split(/\s+/).includes(WIREFRAME_CLASS);
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

function fillSlot(
  slot: SvgElement,
  iconPath: string,
  templateDefs: SvgElement,
  templateDoc: SvgDocument
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

  const iconDoc = parseSvgFile(iconPath);
  const iconRoot = svgDocumentElement(iconDoc);
  const [ox, oy, sw, sh] = readViewBox(iconRoot);
  if (sw <= 0 || sh <= 0) {
    throw new Error(`Invalid icon viewBox dimensions in ${iconPath}`);
  }
  const cxBox = bx + bw / 2;
  const cyBox = by + bh / 2;
  const cxIcon = ox + sw / 2;
  const cyIcon = oy + sh / 2;
  const tx = cxBox - cxIcon;
  const ty = cyBox - cyIcon;

  const [defsNodes, visual] = partitionIconChildren(iconRoot);
  if (defsNodes.length) {
    mergeIconDefsInto(templateDefs, defsNodes, templateDoc);
  }

  slot.removeChild(wire);

  const wrap = templateDoc.createElementNS(SVG_NS, "g");
  wrap.setAttribute("transform", `translate(${tx} ${ty})`);
  for (const node of visual) {
    wrap.appendChild(templateDoc.importNode(node, true));
  }
  slot.appendChild(wrap);
}

export function runPhase5(
  templatePath: PathLike,
  iconsDir: PathLike,
  outputPath: PathLike,
  options: { missing?: MissingPolicy } = {}
): { filled: number; skipped: number; missingIds: string[] } {
  const missing = options.missing ?? "skip";
  const tp = String(templatePath);
  const idir = String(iconsDir);
  const out = String(outputPath);
  if (!existsSync(tp)) throw new Error(`Template not found: ${tp}`);
  if (!existsSync(idir)) throw new Error(`Icons directory not found: ${idir}`);

  const templateDoc = parseSvgFile(tp);
  const root = svgDocumentElement(templateDoc);
  const symbols = findSymbolsGroup(root);
  const templateDefs = ensureTemplateDefs(root);
  const expected = expectedSlotIds();

  let filled = 0;
  let skipped = 0;
  const missingIds: string[] = [];

  for (const slot of [...elementChildren(symbols)]) {
    if (localTag(slot) !== "g") continue;
    const sid = slot.getAttribute("id");
    if (!sid || !expected.has(sid)) continue;
    if (!parseWeightStem(sid)) continue;

    const iconFile = join(idir, `${sid}.svg`);
    if (!existsSync(iconFile)) {
      missingIds.push(sid);
      if (missing === "fail") {
        throw new Error(`Missing icon for template slot ${sid}: ${iconFile}`);
      }
      if (missing === "warn") {
        console.warn(`Phase 5: missing icon for slot ${sid} (${iconFile}), leaving wireframe.`);
      }
      skipped++;
      continue;
    }

    fillSlot(slot, iconFile, templateDefs, templateDoc);
    filled++;
  }

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, elementToBytes(root));

  return { filled, skipped, missingIds };
}
