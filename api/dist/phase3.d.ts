import type { PathLike } from "node:fs";
import { type SvgElement } from "./xml.js";
export declare const STROKE_WIDTH_BY_WEIGHT_SUFFIX: Record<string, number>;
export declare function parseWeightStem(stem: string): [string, string] | null;
export declare function elementIsStroked(el: SvgElement): boolean;
export declare function applyStrokeWidthsToTree(root: SvgElement, width: number): number;
export declare function runPhase3(outputDir: PathLike): Record<string, number>;
