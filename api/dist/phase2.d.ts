import type { PathLike } from "node:fs";
export declare const PHASE2_WEIGHTS: readonly ["Black", "Heavy", "Bold", "Semibold", "Medium", "Regular", "Light", "Thin", "Ultralight"];
export declare const PHASE2_SIZE_SUFFIX: [string, string][];
export declare function runPhase2(outputDir: PathLike): Record<string, string>;
