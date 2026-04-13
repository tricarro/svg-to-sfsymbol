import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bakeVisualSubtree, buildSizeVariantBakeMatrix } from "../svg/affineBake.js";
import { deepCloneElement, elementChildren, elementToBytes, localTag, parseSvgFile, parseSvgXml, svgDocumentElement, } from "../svg/xml.js";
const _FLOAT_RE = /^[-+]?(?:\d*\.?\d+(?:[eE][-+]?\d+)?)$/;
function parseLength(value) {
    if (value === null)
        return null;
    let v = value.trim();
    for (const suffix of ["px", "pt", "pc", "mm", "cm", "in"]) {
        if (v.toLowerCase().endsWith(suffix)) {
            v = v.slice(0, -suffix.length).trim();
            break;
        }
    }
    if (!v || v.endsWith("%"))
        return null;
    if (!_FLOAT_RE.test(v))
        return null;
    return parseFloat(v);
}
function parseViewBox(raw) {
    if (!raw)
        return null;
    const parts = raw.trim().split(/[,\s]+/).filter(Boolean);
    const nums = [];
    for (const p of parts) {
        const n = parseFloat(p);
        if (Number.isNaN(n))
            return null;
        nums.push(n);
    }
    if (nums.length !== 4)
        return null;
    const [x, y, w, h] = nums;
    if (w <= 0 || h <= 0)
        return null;
    return [x, y, w, h];
}
export const SIZE_VARIANTS = [
    { name: "large", sidePx: 164 },
    { name: "medium", sidePx: 136 },
    { name: "small", sidePx: 112 },
];
export function readViewBox(svgRoot) {
    const vb = parseViewBox(svgRoot.getAttribute("viewBox"));
    if (vb)
        return vb;
    const w = parseLength(svgRoot.getAttribute("width"));
    const h = parseLength(svgRoot.getAttribute("height"));
    if (w !== null && h !== null && w > 0 && h > 0)
        return [0, 0, w, h];
    throw new Error("SVG root must have a valid viewBox or numeric width and height (px or unitless).");
}
function partitionVisualChildren(svgRoot) {
    const defsNodes = [];
    const other = [];
    for (const child of elementChildren(svgRoot)) {
        if (localTag(child) === "defs")
            defsNodes.push(child);
        else
            other.push(child);
    }
    return [defsNodes, other];
}
export function buildVariantSvg(svgRoot, sidePx) {
    const [ox, oy, ow, oh] = readViewBox(svgRoot);
    const root = deepCloneElement(svgRoot);
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
    const m = buildSizeVariantBakeMatrix(s, ox, oy, tx, ty);
    for (const node of other) {
        bakeVisualSubtree(node, m);
        root.appendChild(node);
    }
    root.setAttribute("viewBox", `0 0 ${sidePx} ${sidePx}`);
    root.setAttribute("width", String(sidePx));
    root.setAttribute("height", String(sidePx));
    return root;
}
export function runSizeVariants(inputPath, outputDir, options = {}) {
    const originalName = options.originalName ?? "original.svg";
    mkdirSync(outputDir, { recursive: true });
    const outDir = String(outputDir);
    const origOut = join(outDir, originalName);
    copyFileSync(inputPath, origOut);
    const doc = parseSvgFile(inputPath);
    const svgRoot = svgDocumentElement(doc);
    const written = { original: origOut };
    for (const v of SIZE_VARIANTS) {
        const variantRoot = buildVariantSvg(svgRoot, v.sidePx);
        const outPath = join(outDir, `${v.name}.svg`);
        writeFileSync(outPath, elementToBytes(variantRoot));
        written[v.name] = outPath;
    }
    return written;
}
/** Parse SVG string to root element (for tests). */
export function parseSvgString(xml) {
    const doc = parseSvgXml(xml);
    return svgDocumentElement(doc);
}
