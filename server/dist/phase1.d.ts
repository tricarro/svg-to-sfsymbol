import type { PathLike } from "node:fs";
import { type SvgElement } from "./xml.js";
export interface SizeVariant {
    name: string;
    sidePx: number;
}
export declare const PHASE1_VARIANTS: SizeVariant[];
export declare function readViewBox(svgRoot: SvgElement): [number, number, number, number];
export declare function buildVariantSvg(svgRoot: SvgElement, sidePx: number): SvgElement;
export declare function runPhase1(inputPath: PathLike, outputDir: PathLike, options?: {
    originalName?: string;
}): Record<string, string>;
/** Parse SVG string to root element (for tests). */
export declare function parseSvgString(xml: string): SvgElement;
