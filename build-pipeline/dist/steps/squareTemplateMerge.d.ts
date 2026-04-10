import type { PathLike } from "node:fs";
export type MissingPolicy = "skip" | "warn" | "fail";
export declare function defaultSquareTemplatePath(): string | null;
export declare function runSquareTemplateMerge(templatePath: PathLike, iconsDir: PathLike, outputPath: PathLike, options?: {
    missing?: MissingPolicy;
}): {
    filled: number;
    skipped: number;
    missingIds: string[];
};
