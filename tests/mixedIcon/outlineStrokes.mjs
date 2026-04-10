/**
 * Post-export: convert stroked SVG geometry to filled paths (Maker.js expandPaths).
 * Aligns outlined path data to the original stroke centerline using Paper bounds — Maker.js
 * toSVGPathData normalizes position; without this, horizontal strokes drift vertically.
 * v1: presentation attributes + ancestor inheritance; skips url() strokes and dash arrays.
 */

import { createRequire } from 'module';
import { JSDOM } from 'jsdom';
import { createCanvas } from 'canvas';
import paper from 'paper';

const require = createRequire(import.meta.url);
const makerjs = require('makerjs');

const SVG_NS = 'http://www.w3.org/2000/svg';

/** @param {string} v */
function isNoneOrTransparent(v) {
  if (v == null || v === '') return true;
  const s = String(v).trim().toLowerCase();
  return s === 'none' || s === 'transparent';
}

/** @param {string} v */
function isGradientOrPattern(v) {
  return /^\s*url\s*\(/i.test(String(v || ''));
}

/**
 * @param {Element} el
 * @param {Element} root
 */
function ancestorChainToSvg(el, root) {
  const chain = [];
  let n = el;
  while (n) {
    chain.unshift(n);
    if (n === root) break;
    n = n.parentElement;
  }
  return chain;
}

/**
 * @param {Element} el
 * @param {Element} root
 */
function resolveStrokePresentation(el, root) {
  const chain = ancestorChainToSvg(el, root);

  const out = {
    fill: null,
    stroke: null,
    strokeWidth: '1',
    strokeLinecap: 'butt',
    strokeLinejoin: 'miter',
    strokeDasharray: null,
  };

  for (const node of chain) {
    if (node.nodeType !== 1) continue;
    if (node.hasAttribute('fill')) out.fill = node.getAttribute('fill');
    if (node.hasAttribute('stroke')) out.stroke = node.getAttribute('stroke');
    if (node.hasAttribute('stroke-width')) out.strokeWidth = node.getAttribute('stroke-width');
    if (node.hasAttribute('stroke-linecap')) out.strokeLinecap = node.getAttribute('stroke-linecap');
    if (node.hasAttribute('stroke-linejoin')) out.strokeLinejoin = node.getAttribute('stroke-linejoin');
    if (node.hasAttribute('stroke-dasharray')) out.strokeDasharray = node.getAttribute('stroke-dasharray');
  }

  return out;
}

/** @param {string} join */
function strokeLinejoinToJoints(join) {
  const j = String(join || 'miter').toLowerCase();
  if (j === 'round') return 0;
  if (j === 'bevel') return 2;
  return 1;
}

/** @param {string} d */
function escapePathDForSvgAttr(d) {
  return String(d).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Bounding-box center of path `d` in SVG user units (Paper import).
 * @param {string} pathD
 * @returns {{ x: number, y: number } | null}
 */
function pathDataBBoxCenter(pathD) {
  if (!pathD || !pathD.trim()) return null;
  paper.setup(createCanvas(1, 1));
  paper.project.clear();
  try {
    paper.project.importSVG(
      `<svg xmlns="http://www.w3.org/2000/svg"><path d="${escapePathDForSvgAttr(pathD)}"/></svg>`,
      { insert: true, expandShapes: true },
    );
  } catch {
    return null;
  }
  const items = paper.project
    .getItems({ recursive: true })
    .filter((i) => i instanceof paper.Path || i instanceof paper.CompoundPath);
  if (!items.length) return null;
  let b = items[0].bounds;
  for (let i = 1; i < items.length; i++) b = b.unite(items[i].bounds);
  return { x: b.center.x, y: b.center.y };
}

/**
 * @param {string} tag
 * @param {string} inputData
 */
function referencePathDForBBox(tag, inputData) {
  if (tag === 'path') return inputData;
  if (tag === 'line') {
    const parts = inputData.trim().split(/\s+/);
    if (parts.length < 2) return null;
    const [a, b] = parts;
    const [x1, y1] = a.split(',').map(Number);
    const [x2, y2] = b.split(',').map(Number);
    if ([x1, y1, x2, y2].some((n) => Number.isNaN(n))) return null;
    return `M${x1} ${y1}L${x2} ${y2}`;
  }
  const pairs = inputData
    .trim()
    .split(/\s+/)
    .map((p) => p.split(',').map(Number));
  if (!pairs.length || pairs.some((p) => p.length < 2 || p.some(Number.isNaN))) return null;
  const closed = tag === 'polygon';
  let d = `M${pairs[0][0]} ${pairs[0][1]}`;
  for (let i = 1; i < pairs.length; i++) d += `L${pairs[i][0]} ${pairs[i][1]}`;
  if (closed) d += 'Z';
  return d;
}

/**
 * @param {string} inputData
 * @param {number} halfWidth
 * @param {number} joints
 * @param {'path' | 'polyline' | 'polygon'} tagForMaker
 */
function outlineWithMakerjs(inputData, halfWidth, joints, tagForMaker) {
  function buildInput(bezierAccuracy) {
    if (tagForMaker === 'polyline' || tagForMaker === 'polygon') {
      const closed = tagForMaker === 'polygon';
      return makerjs.model.mirror(new makerjs.models.ConnectTheDots(closed, inputData), false, true);
    }
    return makerjs.importer.fromSVGPathData(inputData, { bezierAccuracy });
  }

  function run(inputModel, j) {
    const result = makerjs.model.expandPaths(inputModel, halfWidth, j, {});
    try {
      makerjs.model.simplify(result);
    } catch {
      /* simplify can throw on degenerate expanded geometry */
    }
    return makerjs.exporter.toSVGPathData(result, false);
  }

  const accuracies = [0.25, 1, 2, 4];
  const jointAttempts = joints !== 0 ? [joints, 0] : [0];

  let lastErr;
  for (const acc of accuracies) {
    let input;
    try {
      input = buildInput(acc);
    } catch (e) {
      lastErr = e;
      continue;
    }
    for (const j of jointAttempts) {
      try {
        return run(input, j);
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw lastErr || new Error('expandPaths failed');
}

/**
 * @param {string} newD
 * @param {string | null} refD
 * @param {boolean} skipAlign
 */
function alignmentTranslate(newD, refD, skipAlign) {
  if (skipAlign || !refD) return { tx: 0, ty: 0 };
  const c0 = pathDataBBoxCenter(refD);
  const c1 = pathDataBBoxCenter(newD);
  if (!c0 || !c1) return { tx: 0, ty: 0 };
  return { tx: c0.x - c1.x, ty: c0.y - c1.y };
}

/** @param {string} svgString */
export function outlineStrokesInSvgString(svgString) {
  const warnings = { dash: false, gradient: false };

  const { window } = new JSDOM(svgString, { contentType: 'image/svg+xml' });
  const { document: doc, XMLSerializer } = window;

  const svg = doc.querySelector('svg');
  if (!svg) {
    throw new Error('No root <svg> found');
  }

  const candidates = svg.querySelectorAll('path,line,polyline,polygon');
  const toProcess = [];

  for (const el of candidates) {
    const pres = resolveStrokePresentation(el, svg);
    if (isNoneOrTransparent(pres.stroke)) continue;
    if (isGradientOrPattern(pres.stroke)) {
      if (!warnings.gradient) {
        console.warn(
          '[outline-strokes] Skipping path(s) with gradient/pattern stroke (url(...)); not supported in v1.',
        );
        warnings.gradient = true;
      }
      continue;
    }
    const dash =
      pres.strokeDasharray &&
      !isNoneOrTransparent(pres.strokeDasharray) &&
      String(pres.strokeDasharray).trim() !== '';
    if (dash) {
      if (!warnings.dash) {
        console.warn('[outline-strokes] Skipping path(s) with stroke-dasharray; not supported in v1.');
        warnings.dash = true;
      }
      continue;
    }

    const sw = parseFloat(String(pres.strokeWidth).replace(/px$/i, '')) || 1;
    if (sw <= 0) continue;

    const tag = el.tagName.toLowerCase();
    let inputData = null;
    if (tag === 'path') inputData = el.getAttribute('d');
    else if (tag === 'line') {
      const x1 = el.getAttribute('x1');
      const y1 = el.getAttribute('y1');
      const x2 = el.getAttribute('x2');
      const y2 = el.getAttribute('y2');
      if (x1 != null && y1 != null && x2 != null && y2 != null) {
        inputData = `${x1},${y1} ${x2},${y2}`;
      }
    } else {
      inputData = el.getAttribute('points');
    }
    if (!inputData || !inputData.trim()) continue;

    toProcess.push({ el, pres, sw, tag, inputData });
  }

  for (const { el, pres, sw, tag, inputData } of toProcess) {
    const joints = strokeLinejoinToJoints(pres.strokeLinejoin);
    const tagForMaker = tag === 'line' ? 'polyline' : tag === 'polygon' ? 'polygon' : tag === 'polyline' ? 'polyline' : 'path';

    let newD;
    try {
      newD = outlineWithMakerjs(inputData, sw / 2, joints, tagForMaker);
    } catch (e) {
      console.warn(`[outline-strokes] outline failed for <${tag}>: ${e.message}`);
      continue;
    }
    if (!newD || !String(newD).trim()) continue;

    const refD = referencePathDForBBox(tag, inputData);
    const skipAlign = el.hasAttribute('transform');
    const { tx, ty } = alignmentTranslate(newD, refD, skipAlign);

    const strokePaint = pres.stroke.trim();
    const hasFill = pres.fill != null && !isNoneOrTransparent(pres.fill);

    const copyPresentationAttrs = (from, to) => {
      const keep = ['transform', 'clip-path', 'opacity', 'fill-rule', 'class', 'style'];
      for (const a of keep) {
        if (from.hasAttribute(a)) to.setAttribute(a, from.getAttribute(a));
      }
    };

    const wrapIfNeeded = (pathEl) => {
      if (Math.abs(tx) < 1e-4 && Math.abs(ty) < 1e-4) return pathEl;
      const g = el.ownerDocument.createElementNS(SVG_NS, 'g');
      g.setAttribute('transform', `translate(${tx},${ty})`);
      g.appendChild(pathEl);
      return g;
    };

    if (hasFill) {
      const docEl = el.ownerDocument;
      const strokePath = docEl.createElementNS(SVG_NS, 'path');
      strokePath.setAttribute('d', newD);
      strokePath.setAttribute('fill', strokePaint);
      const node = wrapIfNeeded(strokePath);
      copyPresentationAttrs(el, node);
      el.parentNode.insertBefore(node, el);

      el.removeAttribute('stroke');
      el.removeAttribute('stroke-width');
      el.removeAttribute('stroke-linecap');
      el.removeAttribute('stroke-linejoin');
      el.removeAttribute('stroke-miterlimit');
      el.removeAttribute('stroke-dasharray');
      el.removeAttribute('stroke-dashoffset');
      el.removeAttribute('stroke-opacity');
    } else {
      if (tag !== 'path') {
        const docEl = el.ownerDocument;
        const pathEl = docEl.createElementNS(SVG_NS, 'path');
        pathEl.setAttribute('d', newD);
        pathEl.setAttribute('fill', strokePaint);
        const node = wrapIfNeeded(pathEl);
        copyPresentationAttrs(el, node);
        el.parentNode.insertBefore(node, el);
        el.remove();
      } else {
        if (Math.abs(tx) < 1e-4 && Math.abs(ty) < 1e-4) {
          el.setAttribute('d', newD);
          el.setAttribute('fill', strokePaint);
        } else {
          const g = el.ownerDocument.createElementNS(SVG_NS, 'g');
          g.setAttribute('transform', `translate(${tx},${ty})`);
          const inner = el.ownerDocument.createElementNS(SVG_NS, 'path');
          inner.setAttribute('d', newD);
          inner.setAttribute('fill', strokePaint);
          g.appendChild(inner);
          copyPresentationAttrs(el, g);
          el.parentNode.insertBefore(g, el);
          el.remove();
          continue;
        }
        el.removeAttribute('stroke');
        el.removeAttribute('stroke-width');
        el.removeAttribute('stroke-linecap');
        el.removeAttribute('stroke-linejoin');
        el.removeAttribute('stroke-miterlimit');
        el.removeAttribute('stroke-dasharray');
        el.removeAttribute('stroke-dashoffset');
        el.removeAttribute('stroke-opacity');
      }
    }
  }

  return new XMLSerializer().serializeToString(svg);
}
