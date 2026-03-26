import { copyFileSync, existsSync, unlinkSync } from "node:fs";
import type { PathLike } from "node:fs";
import { join } from "node:path";
import { PHASE1_VARIANTS } from "./phase1.js";

export const PHASE2_WEIGHTS = [
  "Black",
  "Heavy",
  "Bold",
  "Semibold",
  "Medium",
  "Regular",
  "Light",
  "Thin",
  "Ultralight",
] as const;

export const PHASE2_SIZE_SUFFIX: [string, string][] = PHASE1_VARIANTS.map((v) => [
  v.name,
  v.name === "large" ? "L" : v.name === "medium" ? "M" : "S",
]);

export function runPhase2(outputDir: PathLike): Record<string, string> {
  const dir = String(outputDir);
  const written: Record<string, string> = {};

  for (const [sizeKey, suffix] of PHASE2_SIZE_SUFFIX) {
    const src = join(dir, `${sizeKey}.svg`);
    if (!existsSync(src)) {
      throw new Error(
        `Phase 2 expects ${sizeKey}.svg in ${dir}; run phase 1 first or use the combined convert command.`
      );
    }
    for (const weight of PHASE2_WEIGHTS) {
      const stem = `${weight}-${suffix}`;
      const dest = join(dir, `${stem}.svg`);
      copyFileSync(src, dest);
      written[stem] = dest;
    }
    unlinkSync(src);
  }

  return written;
}
