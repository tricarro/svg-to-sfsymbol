/**
 * SVG XML I/O: strip DOCTYPE before parse (XXE / entity hardening), then @xmldom/xmldom.
 */
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { readFileSync } from "node:fs";
export const SVG_NS = "http://www.w3.org/2000/svg";
export function stripDoctype(xml) {
    return xml.replace(/<!DOCTYPE[\s\S]*?>/gi, "");
}
export function localTag(el) {
    if (el.localName)
        return el.localName;
    const t = el.tagName ?? "";
    const i = t.indexOf(":");
    return i >= 0 ? t.slice(i + 1) : t;
}
export function parseSvgXml(xml) {
    const cleaned = stripDoctype(xml.trim());
    const doc = new DOMParser({
        onError: (level, msg) => {
            if (level === "fatalError")
                throw new Error(msg);
        },
    }).parseFromString(cleaned, "application/xml");
    const de = doc.documentElement;
    if (!de || localTag(de) !== "svg") {
        throw new Error("Root element must be svg");
    }
    return doc;
}
export function parseSvgFile(path) {
    const buf = readFileSync(path);
    return parseSvgXml(buf.toString("utf-8"));
}
export function svgDocumentElement(doc) {
    const r = doc.documentElement;
    if (!r || localTag(r) !== "svg")
        throw new Error("Root element must be svg");
    return r;
}
export function elementChildren(el) {
    const out = [];
    for (let i = 0; i < el.childNodes.length; i++) {
        const n = el.childNodes[i];
        if (n.nodeType === 1)
            out.push(n);
    }
    return out;
}
export function deepCloneElement(el) {
    return el.cloneNode(true);
}
export function elementToBytes(root) {
    if (!root.getAttribute("xmlns")) {
        root.setAttribute("xmlns", SVG_NS);
    }
    const ser = new XMLSerializer();
    const body = ser.serializeToString(root);
    const decl = '<?xml version="1.0" encoding="UTF-8"?>\n';
    return Buffer.from(decl + body, "utf-8");
}
