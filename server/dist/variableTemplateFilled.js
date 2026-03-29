/**
 * Merge a filled (non-stroked) icon into resources/square_variable_template.svg layout.
 * Reads template from disk once; never writes the source template file.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import SvgPath from "svgpath";
import { buildVariantSvg, readViewBox } from "./phase1.js";
import { elementChildren, elementToBytes, localTag, parseSvgFile, parseSvgXml, SVG_NS, svgDocumentElement, } from "./xml.js";
const WIREFRAME_CLASS = "SFSymbolsPreviewWireframe";
const VARIABLE_SLOT_IDS = ["Ultralight-S", "Regular-S", "Black-S"];
const ENV_VARIABLE_TEMPLATE = "SFSYMBOL_VARIABLE_TEMPLATE_PATH";
function expandUser(p) {
    if (p === "~")
        return homedir();
    if (p.startsWith("~/"))
        return join(homedir(), p.slice(2));
    return p;
}
function repoRootFromModule() {
    const here = dirname(fileURLToPath(import.meta.url));
    return join(here, "..", "..");
}
export function defaultVariableTemplatePath() {
    const candidate = join(repoRootFromModule(), "resources", "square_variable_template.svg");
    return existsSync(candidate) ? candidate : null;
}
export function resolveVariableTemplatePath() {
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
        throw new Error(`No SF Symbol variable template found. Set ${ENV_VARIABLE_TEMPLATE} to the template file path, ` +
            "or add resources/square_variable_template.svg at the repository root.");
    }
    return def;
}
function findSymbolsGroup(root) {
    const walk = (el) => {
        if (localTag(el) === "g" && el.getAttribute("id") === "Symbols")
            return el;
        for (const c of elementChildren(el)) {
            const f = walk(c);
            if (f)
                return f;
        }
        return null;
    };
    const g = walk(root);
    if (!g)
        throw new Error('No <g id="Symbols"> found in variable template.');
    return g;
}
function ensureTemplateDefs(svgRoot) {
    for (const ch of elementChildren(svgRoot)) {
        if (localTag(ch) === "defs")
            return ch;
    }
    const doc = svgRoot.ownerDocument;
    if (!doc)
        throw new Error("template svg has no owner document");
    const defs = doc.createElementNS(SVG_NS, "defs");
    svgRoot.insertBefore(defs, svgRoot.firstChild);
    return defs;
}
function pathBBoxFromD(d) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const add = (x, y) => {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    };
    let p;
    try {
        p = new SvgPath(d).abs().unshort().unarc();
    }
    catch {
        throw new Error(`Degenerate wireframe bbox: unparseable d`);
    }
    let cx = 0;
    let cy = 0;
    for (const s of p.segments) {
        const cmd = String(s[0]);
        if (cmd === "M" || cmd === "m") {
            cx = Number(s[1]);
            cy = Number(s[2]);
            add(cx, cy);
        }
        else if (cmd === "L" || cmd === "l" || cmd === "T" || cmd === "t") {
            cx = Number(s[s.length - 2]);
            cy = Number(s[s.length - 1]);
            add(cx, cy);
        }
        else if (cmd === "H" || cmd === "h") {
            cx = Number(s[1]);
            add(cx, cy);
        }
        else if (cmd === "V" || cmd === "v") {
            cy = Number(s[1]);
            add(cx, cy);
        }
        else if (cmd === "C" || cmd === "c") {
            add(Number(s[1]), Number(s[2]));
            add(Number(s[3]), Number(s[4]));
            cx = Number(s[5]);
            cy = Number(s[6]);
            add(cx, cy);
        }
        else if (cmd === "Q" || cmd === "q") {
            add(Number(s[1]), Number(s[2]));
            cx = Number(s[3]);
            cy = Number(s[4]);
            add(cx, cy);
        }
        else if (cmd === "Z" || cmd === "z") {
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
function classHasWireframe(classAttr) {
    if (!classAttr)
        return false;
    return classAttr.split(/\s+/).includes(WIREFRAME_CLASS);
}
function partitionIconChildren(iconRoot) {
    const defsNodes = [];
    const other = [];
    for (const ch of elementChildren(iconRoot)) {
        if (localTag(ch) === "defs")
            defsNodes.push(ch);
        else
            other.push(ch);
    }
    return [defsNodes, other];
}
function mergeIconDefsInto(templateDefs, defsElements, templateDoc) {
    const existingIds = new Set();
    const collectIds = (el) => {
        const id = el.getAttribute("id");
        if (id)
            existingIds.add(id);
        for (const c of elementChildren(el))
            collectIds(c);
    };
    collectIds(templateDefs);
    for (const defsEl of defsElements) {
        for (const child of [...elementChildren(defsEl)]) {
            const cid = child.getAttribute("id");
            if (cid !== null && existingIds.has(cid))
                continue;
            const imported = templateDoc.importNode(child, true);
            templateDefs.appendChild(imported);
            if (cid !== null)
                existingIds.add(cid);
        }
    }
}
function findSlot(symbols, slotId) {
    for (const ch of elementChildren(symbols)) {
        if (localTag(ch) !== "g")
            continue;
        if (ch.getAttribute("id") === slotId)
            return ch;
    }
    return null;
}
function fillSlotWithVisuals(slot, visual, templateDoc, iconCenterX, iconCenterY) {
    let wire = null;
    for (const child of elementChildren(slot)) {
        if (localTag(child) !== "path")
            continue;
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
    const cxBox = bx + bw / 2;
    const cyBox = by + bh / 2;
    const tx = cxBox - iconCenterX;
    const ty = cyBox - iconCenterY;
    slot.removeChild(wire);
    const wrap = templateDoc.createElementNS(SVG_NS, "g");
    wrap.setAttribute("transform", `translate(${tx} ${ty})`);
    for (const node of visual) {
        wrap.appendChild(templateDoc.importNode(node, true));
    }
    slot.appendChild(wrap);
}
/**
 * Build merged variable-template SVG bytes. Does not write `square_variable_template.svg`.
 */
export function mergeFilledIconIntoVariableTemplate(iconSvgXml, opts = {}) {
    const templatePath = opts.templatePath ?? resolveVariableTemplatePath();
    const iconDoc = parseSvgXml(iconSvgXml);
    const iconRootOrig = svgDocumentElement(iconDoc);
    const normalizedRoot = buildVariantSvg(iconRootOrig, 112);
    const [ox, oy, sw, sh] = readViewBox(normalizedRoot);
    if (sw <= 0 || sh <= 0) {
        throw new Error("Invalid normalized icon viewBox dimensions.");
    }
    const iconCenterX = ox + sw / 2;
    const iconCenterY = oy + sh / 2;
    const [defsNodes, visual] = partitionIconChildren(normalizedRoot);
    const templateDoc = parseSvgFile(templatePath);
    const templateRoot = svgDocumentElement(templateDoc);
    const symbols = findSymbolsGroup(templateRoot);
    const templateDefs = ensureTemplateDefs(templateRoot);
    if (defsNodes.length) {
        mergeIconDefsInto(templateDefs, defsNodes, templateDoc);
    }
    for (const id of VARIABLE_SLOT_IDS) {
        const slot = findSlot(symbols, id);
        if (!slot) {
            throw new Error(`Variable template missing required slot <g id="${id}">.`);
        }
        fillSlotWithVisuals(slot, visual, templateDoc, iconCenterX, iconCenterY);
    }
    return elementToBytes(templateRoot);
}
