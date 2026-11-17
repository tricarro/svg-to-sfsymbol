/**
 * SVG XML I/O: strip DOCTYPE before parse (XXE / entity hardening), then @xmldom/xmldom.
 */
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import type { Document as SvgDocument, Element as SvgElement } from "@xmldom/xmldom";
import { readFileSync } from "node:fs";
import type { PathLike } from "node:fs";

export type { SvgDocument, SvgElement };

export const SVG_NS = "http://www.w3.org/2000/svg";

export function stripDoctype(xml: string): string {
  return xml.replace(/<!DOCTYPE[\s\S]*?>/gi, "");
}

export function localTag(el: SvgElement): string {
  if (el.localName) return el.localName;
  const t = el.tagName ?? "";
  const i = t.indexOf(":");
  return i >= 0 ? t.slice(i + 1) : t;
}

export function parseSvgXml(xml: string): SvgDocument {
  const cleaned = stripDoctype(xml.trim());
  const doc = new DOMParser({
    onError: (level, msg) => {
      if (level === "fatalError") throw new Error(msg);
    },
  }).parseFromString(cleaned, "application/xml");
  const de = doc.documentElement;
  if (!de || localTag(de) !== "svg") {
    throw new Error("Root element must be svg");
  }
  return doc;
}

export function parseSvgFile(path: PathLike): SvgDocument {
  const buf = readFileSync(path);
  return parseSvgXml(buf.toString("utf-8"));
}

export function svgDocumentElement(doc: SvgDocument): SvgElement {
  const r = doc.documentElement;
  if (!r || localTag(r) !== "svg") throw new Error("Root element must be svg");
  return r;
}

export function elementChildren(el: SvgElement): SvgElement[] {
  const out: SvgElement[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i];
    if (n.nodeType === 1) out.push(n as SvgElement);
  }
  return out;
}

const SHAPE_TAGS = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text"]);

function declaredFill(el: SvgElement): string | null {
  const a = el.getAttribute("fill");
  if (a !== null && a.trim()) return a.trim();
  const m = /(?:^|;)\s*fill\s*:\s*([^;]+)/i.exec(el.getAttribute("style") ?? "");
  return m ? m[1].trim() : null;
}

/**
 * Copy a fill inherited from an ancestor (e.g. Figma's `<svg fill="none">`) onto shapes that
 * don't declare one, so they keep their paint after being moved out of that ancestor.
 */
export function materializeInheritedFill(root: SvgElement): void {
  const walk = (el: SvgElement, inherited: string | null) => {
    const own = declaredFill(el);
    if (!own && inherited && SHAPE_TAGS.has(localTag(el))) el.setAttribute("fill", inherited);
    for (const c of elementChildren(el)) walk(c, own ?? inherited);
  };
  walk(root, null);
}

export function deepCloneElement(el: SvgElement): SvgElement {
  return el.cloneNode(true) as SvgElement;
}

export function elementToBytes(root: SvgElement): Buffer {
  if (!root.getAttribute("xmlns")) {
    root.setAttribute("xmlns", SVG_NS);
  }
  const ser = new XMLSerializer();
  const body = ser.serializeToString(root);
  const decl = '<?xml version="1.0" encoding="UTF-8"?>\n';
  return Buffer.from(decl + body, "utf-8");
}
