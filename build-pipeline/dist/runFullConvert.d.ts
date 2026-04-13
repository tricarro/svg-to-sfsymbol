import type { PathLike } from "node:fs";
import { type MissingPolicy } from "./steps/squareTemplateMerge.js";
export type { MissingPolicy };
export interface FullConvertResult {
    outDir: string;
    inputStem: string;
    sizeVariantPaths: Record<string, string>;
    mergedSvg: string | null;
    squareTemplateMergeStats: {
        filled: number;
        skipped: number;
        missingIds: string[];
    } | null;
    strokeWidthCounts?: Record<string, number> | null;
    strokeToOutlineCounts?: Record<string, number> | null;
    weightReplicaPaths?: Record<string, string> | null;
}
export declare function runFullConvert(inputPath: PathLike, outDir: PathLike, options?: {
    originalName?: string;
    sizeVariantsOnly?: boolean;
    skipStrokeWidths?: boolean;
    skipStrokeToOutline?: boolean;
    skipSquareTemplateMerge?: boolean;
    squareTemplatePath?: PathLike | null;
    mergedSvgOutputPath?: PathLike | null;
    missingSlotPolicy?: MissingPolicy;
    requireMergedOutput?: boolean;
    outlineFlatness?: number;
}): FullConvertResult;
