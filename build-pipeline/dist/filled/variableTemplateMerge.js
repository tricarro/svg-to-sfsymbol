/**
 * Merge a filled (non-stroked) icon into resources/square_variable_template.svg layout.
 * Reads template from disk once; never writes the source template file.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import SvgPath from "svgpath";
import { buildVariantSvg, readViewBox } from "../steps/sizeVariants.js";
import { elementChildren, elementToBytes, localTag, parseSvgFile, parseSvgXml, SVG_NS, svgDocumentElement, } from "../svg/xml.js";
const WIREFRAME_CLASS = "SFSymbolsPreviewWireframe";
const VARIABLE_SLOT_IDS = ["Ultralight-S", "Regular-S", "Black-S"];
const ENV_VARIABLE_TEMPLATE = "SFSYMBOL_VARIABLE_TEMPLATE_PATH";
/** Stable IDs — unlikely to collide with user icon defs (prefix + descriptive). */
const MORPH_FILTER_ID_ULTRALIGHT = "svg2sfsym-morph-ultralight";
const MORPH_FILTER_ID_BLACK = "svg2sfsym-morph-black";
/**
 * feMorphology radius in user units (112×112 normalized icon space).
 * PRD target ~2 inward / ~4 outward; tune visually if needed.
 */
const MORPH_ERODE_RADIUS = 3;
const MORPH_DILATE_RADIUS = 2;
/** Expanded filter region (fractions of object bounding box) so dilate is not clipped. */
const MORPH_FILTER_REGION = { x: "-0.5", y: "-0.5", width: "2", height: "2" };
/** Normalized icon is built at this side length; Regular-S uses scale 1. */
const VARIABLE_ICON_BASE_SIDE = 112;
/** Ultralight / Black visual size in the same user units as the 112 baseline. */
const VARIABLE_ULTRALIGHT_SIDE = 104;
const VARIABLE_BLACK_SIDE = 120;
function slotVisualScale(slotId) {
    if (slotId === "Ultralight-S")
        return VARIABLE_ULTRALIGHT_SIDE / VARIABLE_ICON_BASE_SIDE;
    if (slotId === "Black-S")
        return VARIABLE_BLACK_SIDE / VARIABLE_ICON_BASE_SIDE;
    return 1;
}
/** Uniform scale about icon center so the center still aligns with the slot wireframe. */
function slotContentTransform(tx, ty, iconCenterX, iconCenterY, slotId) {
    const s = slotVisualScale(slotId);
    if (s === 1) {
        return `translate(${tx} ${ty})`;
    }
    return `translate(${tx} ${ty}) translate(${iconCenterX} ${iconCenterY}) scale(${s}) translate(${-iconCenterX} ${-iconCenterY})`;
}
function expandUser(p) {
    if (p === "~")
        return homedir();
    if (p.startsWith("~/"))
        return join(homedir(), p.slice(2));
    return p;
}
function packageRootFromModule() {
    const here = dirname(fileURLToPath(import.meta.url));
    return join(here, "..", "..");
}
export function defaultVariableTemplatePath() {
    const candidate = join(packageRootFromModule(), "resources", "square_variable_template.svg");
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
            "or add square_variable_template.svg under build-pipeline/resources/.");
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
function appendMorphologyFilter(defs, doc, id, operator, radius) {
    if (doc.getElementById(id))
        return;
    const f = doc.createElementNS(SVG_NS, "filter");
    f.setAttribute("id", id);
    f.setAttribute("filterUnits", "objectBoundingBox");
    f.setAttribute("x", MORPH_FILTER_REGION.x);
    f.setAttribute("y", MORPH_FILTER_REGION.y);
    f.setAttribute("width", MORPH_FILTER_REGION.width);
    f.setAttribute("height", MORPH_FILTER_REGION.height);
    const morph = doc.createElementNS(SVG_NS, "feMorphology");
    morph.setAttribute("in", "SourceGraphic");
    morph.setAttribute("operator", operator);
    morph.setAttribute("radius", String(radius));
    f.appendChild(morph);
    defs.appendChild(f);
}
/** Idempotent: skips creation if each filter id already exists in the document. */
function ensureMorphologyFilters(defs, doc) {
    appendMorphologyFilter(defs, doc, MORPH_FILTER_ID_ULTRALIGHT, "erode", MORPH_ERODE_RADIUS);
    appendMorphologyFilter(defs, doc, MORPH_FILTER_ID_BLACK, "dilate", MORPH_DILATE_RADIUS);
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
function fillSlotWithVisuals(slot, visual, templateDoc, iconCenterX, iconCenterY, slotId) {
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
    wrap.setAttribute("transform", slotContentTransform(tx, ty, iconCenterX, iconCenterY, slotId));
    if (slotId === "Ultralight-S") {
        wrap.setAttribute("filter", `url(#${MORPH_FILTER_ID_ULTRALIGHT})`);
    }
    else if (slotId === "Black-S") {
        wrap.setAttribute("filter", `url(#${MORPH_FILTER_ID_BLACK})`);
    }
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
    const normalizedRoot = buildVariantSvg(iconRootOrig, VARIABLE_ICON_BASE_SIDE);
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
    ensureMorphologyFilters(templateDefs, templateDoc);
    if (defsNodes.length) {
        mergeIconDefsInto(templateDefs, defsNodes, templateDoc);
    }
    for (const id of VARIABLE_SLOT_IDS) {
        const slot = findSlot(symbols, id);
        if (!slot) {
            throw new Error(`Variable template missing required slot <g id="${id}">.`);
        }
        fillSlotWithVisuals(slot, visual, templateDoc, iconCenterX, iconCenterY, id);
    }
    return elementToBytes(templateRoot);
}
