import type { PathLike } from "node:fs";
export declare const SF_SYMBOL_WEIGHTS: readonly ["Black", "Heavy", "Bold", "Semibold", "Medium", "Regular", "Light", "Thin", "Ultralight"];
export declare const WEIGHT_SIZE_SUFFIX: [string, string][];
export declare function runWeightReplicas(outputDir: PathLike): Record<string, string>;
