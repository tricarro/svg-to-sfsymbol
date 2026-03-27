import type { PathLike } from "node:fs";
import { type MissingPolicy } from "./phase5.js";
export interface FullConvertResult {
    outDir: string;
    inputStem: string;
    phase1Paths: Record<string, string>;
    mergedSvg: string | null;
    phase5Stats: {
        filled: number;
        skipped: number;
        missingIds: string[];
    } | null;
    phase3Counts?: Record<string, number> | null;
    phase4Counts?: Record<string, number> | null;
    phase2Written?: Record<string, string> | null;
}
export declare function runFullConvert(inputPath: PathLike, outDir: PathLike, options?: {
    originalName?: string;
    phase1Only?: boolean;
    skipPhase3?: boolean;
    skipPhase4?: boolean;
    skipPhase5?: boolean;
    phase5Template?: PathLike | null;
    phase5Out?: PathLike | null;
    phase5Missing?: MissingPolicy;
    requireMergedSvg?: boolean;
    phase4Flatness?: number;
}): FullConvertResult;
