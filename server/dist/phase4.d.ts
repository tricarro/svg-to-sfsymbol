import type { PathLike } from "node:fs";
import { type SvgElement } from "./xml.js";
export declare function expandStrokesInTree(root: SvgElement, flatness?: number): number;
export declare function runPhase4(outputDir: PathLike, flatness?: number): Record<string, number>;
