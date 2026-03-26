import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import type { PathLike } from "node:fs";
import { runPhase1 } from "./phase1.js";
import { runPhase2 } from "./phase2.js";
import { runPhase3 } from "./phase3.js";
import { runPhase4 } from "./phase4.js";
import { defaultSquareTemplatePath, runPhase5, type MissingPolicy } from "./phase5.js";

export interface FullConvertResult {
  outDir: string;
  inputStem: string;
  phase1Paths: Record<string, string>;
  mergedSvg: string | null;
  phase5Stats: { filled: number; skipped: number; missingIds: string[] } | null;
  phase3Counts?: Record<string, number> | null;
  phase4Counts?: Record<string, number> | null;
  phase2Written?: Record<string, string> | null;
}

export function runFullConvert(
  inputPath: PathLike,
  outDir: PathLike,
  options: {
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
  } = {}
): FullConvertResult {
  const input = String(inputPath);
  const out = String(outDir);
  if (!existsSync(input)) {
    throw new Error(`input not found: ${input}`);
  }

  const stem = basename(input).replace(/\.svg$/i, "");
  const p1 = runPhase1(input, out, { originalName: options.originalName });

  if (options.phase1Only) {
    return {
      outDir: out,
      inputStem: stem,
      phase1Paths: p1,
      mergedSvg: null,
      phase5Stats: null,
    };
  }

  const p2 = runPhase2(out);

  if (options.skipPhase3) {
    return {
      outDir: out,
      inputStem: stem,
      phase1Paths: p1,
      mergedSvg: null,
      phase5Stats: null,
      phase2Written: p2,
    };
  }

  const p3 = runPhase3(out);

  if (options.skipPhase4) {
    return {
      outDir: out,
      inputStem: stem,
      phase1Paths: p1,
      mergedSvg: null,
      phase5Stats: null,
      phase2Written: p2,
      phase3Counts: p3,
    };
  }

  const p4 = runPhase4(out, options.phase4Flatness ?? 1);

  if (options.skipPhase5) {
    return {
      outDir: out,
      inputStem: stem,
      phase1Paths: p1,
      mergedSvg: null,
      phase5Stats: null,
      phase2Written: p2,
      phase3Counts: p3,
      phase4Counts: p4,
    };
  }

  const pt = options.phase5Template != null ? String(options.phase5Template) : null;
  const po = options.phase5Out != null ? String(options.phase5Out) : null;
  if ((pt === null) !== (po === null)) {
    throw new Error(
      "pass both phase5Template and phase5Out, or neither (defaults apply when neither is set)."
    );
  }

  let tmpl: string;
  let outSvg: string;
  if (pt !== null && po !== null) {
    tmpl = pt;
    outSvg = po;
  } else {
    const def = defaultSquareTemplatePath();
    if (def === null) {
      if (options.requireMergedSvg) {
        throw new Error(
          "No SF Symbol square template found. Set SFSYMBOL_TEMPLATE_PATH " +
            "or add resources/square_template.svg at the repository root."
        );
      }
      return {
        outDir: out,
        inputStem: stem,
        phase1Paths: p1,
        mergedSvg: null,
        phase5Stats: null,
        phase2Written: p2,
        phase3Counts: p3,
        phase4Counts: p4,
      };
    }
    tmpl = def;
    outSvg = join(out, `${stem}_SFSymbol.svg`);
  }

  const stats = runPhase5(tmpl, out, outSvg, {
    missing: options.phase5Missing ?? "skip",
  });
  return {
    outDir: out,
    inputStem: stem,
    phase1Paths: p1,
    mergedSvg: outSvg,
    phase5Stats: stats,
    phase2Written: p2,
    phase3Counts: p3,
    phase4Counts: p4,
  };
}
