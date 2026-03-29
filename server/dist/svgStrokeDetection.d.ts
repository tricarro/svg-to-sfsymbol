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
