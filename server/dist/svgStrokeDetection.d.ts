/**
 * Classify upload SVG as stroked-input vs filled-input for routing.
 * Heuristic only: ignores <use>, complex CSS, inherited display, etc.
 */
import { type SvgElement } from "./xml.js";
/**
 * True if this element paints a visible stroke per presentation attrs / inline style only.
 */
export declare function elementHasVisibleStroke(el: SvgElement): boolean;
/**
 * Parse SVG XML and return "stroked" if any graphical element has a visible stroke;
 * otherwise "filled" (fill-only / no stroke artwork).
 */
export declare function classifySvgStrokedOrFilled(xml: string): "stroked" | "filled";
export declare function elementHasVisibleFill(el: SvgElement): boolean;
/**
 * Max stroke-width among visibly stroked graphical elements (missing width counts as 1),
 * and stroke color from the first such element in document order. Used when preprocessing
 * mixed icons before the square pipeline.
 */
export declare function representativeStrokeStyleForMixedPreprocess(root: SvgElement): {
    width: number;
    color: string;
};
/**
 * Route uploads: fill-only, stroke-only, or both (mixed → square pipeline after fill-to-stroke preprocess).
 */
export declare function classifySvgRouting(xml: string): "filled" | "stroked-only" | "mixed";
