/**
 * Mixed-icon test: duplicate filled path-like items, stroke the copies, normalize widths,
 * then optionally outline strokes to fills (svg-path-outline / Maker.js).
 * v1: Paper import with expandShapes; inline/presentation fills; CSS-only fills skipped.
 * Layering: each clone is insertAbove(original). Stroke→fill inserts a filled outline before the path when both fill and stroke exist.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname, basename, extname, join } from 'path';
import { createCanvas } from 'canvas';
import paper from 'paper';
import { outlineStrokesInSvgString } from './outlineStrokes.mjs';

const STROKE_WIDTH = 21;

function isTopLevelPathLike(item) {
  if (item instanceof paper.CompoundPath) return true;
  if (item instanceof paper.Path && !(item.parent instanceof paper.CompoundPath)) return true;
  return false;
}

function hasOpaqueFill(item) {
  const fc = item.fillColor;
  if (!fc) return false;
  if (fc.gradient) return true;
  const a = fc.alpha;
  if (a != null && a <= 0) return false;
  return true;
}

function strokeColorFromFill(item) {
  const fc = item.fillColor;
  if (!fc || fc.gradient) return new paper.Color('black');
  const a = fc.alpha;
  if (a != null && a <= 0) return new paper.Color('black');
  return fc.clone();
}

function normalizeStrokeWidths(project) {
  for (const item of project.getItems({ recursive: true })) {
    if (
      (item instanceof paper.Path || item instanceof paper.CompoundPath) &&
      item.strokeColor != null
    ) {
      item.strokeWidth = STROKE_WIDTH;
    }
  }
}

function parseArgs(argv) {
  const positional = [];
  let noOutline = false;
  for (const a of argv) {
    if (a === '--no-outline') noOutline = true;
    else positional.push(a);
  }
  return { positional, noOutline };
}

function main() {
  const { positional, noOutline } = parseArgs(process.argv.slice(2));
  if (positional.length < 1) {
    console.error('Usage: node process.mjs [--no-outline] <input.svg> [output.svg]');
    process.exit(1);
  }

  const inputPath = resolve(positional[0]);
  const outputPath = positional[1]
    ? resolve(positional[1])
    : join(dirname(inputPath), `${basename(inputPath, extname(inputPath))}-out.svg`);

  if (!existsSync(inputPath)) {
    console.error(`Input not found: ${inputPath}`);
    process.exit(1);
  }

  let svgText;
  try {
    svgText = readFileSync(inputPath, 'utf8');
  } catch (e) {
    console.error(`Failed to read input: ${e.message}`);
    process.exit(1);
  }

  paper.setup(createCanvas(1, 1));
  try {
    paper.project.importSVG(svgText, {
      insert: true,
      applyMatrix: true,
      expandShapes: true,
    });
  } catch (e) {
    console.error(`Failed to import SVG: ${e.message}`);
    process.exit(1);
  }

  const candidates = paper.project
    .getItems({ recursive: true })
    .filter(isTopLevelPathLike)
    .filter(hasOpaqueFill);

  if (candidates.length === 0) {
    console.error(
      'No filled path-like items found (v1: inline/presentation fills only; CSS stylesheet fills are not applied).',
    );
    process.exit(1);
  }

  for (const original of candidates) {
    const dup = original.clone({ insert: false });
    dup.fillColor = null;
    dup.strokeColor = strokeColorFromFill(original);
    dup.insertAbove(original);
  }

  normalizeStrokeWidths(paper.project);

  let out;
  try {
    out = paper.project.exportSVG({
      asString: true,
      bounds: 'content',
    });
  } catch (e) {
    console.error(`Failed to export SVG: ${e.message}`);
    process.exit(1);
  }

  if (!noOutline) {
    try {
      out = outlineStrokesInSvgString(out);
    } catch (e) {
      console.error(`Failed to outline strokes: ${e.message}`);
      process.exit(1);
    }
  }

  try {
    writeFileSync(outputPath, out, 'utf8');
  } catch (e) {
    console.error(`Failed to write output: ${e.message}`);
    process.exit(1);
  }

  console.log(
    `Wrote ${outputPath} (${candidates.length} filled path-like item(s) duplicated${noOutline ? '; outline step skipped' : '; strokes outlined to fills'})`,
  );
}

main();
