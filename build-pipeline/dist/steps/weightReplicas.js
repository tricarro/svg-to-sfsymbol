import { copyFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { SIZE_VARIANTS } from "./sizeVariants.js";
export const SF_SYMBOL_WEIGHTS = [
    "Black",
    "Heavy",
    "Bold",
    "Semibold",
    "Medium",
    "Regular",
    "Light",
    "Thin",
    "Ultralight",
];
export const WEIGHT_SIZE_SUFFIX = SIZE_VARIANTS.map((v) => [
    v.name,
    v.name === "large" ? "L" : v.name === "medium" ? "M" : "S",
]);
export function runWeightReplicas(outputDir) {
    const dir = String(outputDir);
    const written = {};
    for (const [sizeKey, suffix] of WEIGHT_SIZE_SUFFIX) {
        const src = join(dir, `${sizeKey}.svg`);
        if (!existsSync(src)) {
            throw new Error(`Weight replica step expects ${sizeKey}.svg in ${dir}; run size variants first or use the combined convert entrypoint.`);
        }
        for (const weight of SF_SYMBOL_WEIGHTS) {
            const stem = `${weight}-${suffix}`;
            const dest = join(dir, `${stem}.svg`);
            copyFileSync(src, dest);
            written[stem] = dest;
        }
        unlinkSync(src);
    }
    return written;
}
