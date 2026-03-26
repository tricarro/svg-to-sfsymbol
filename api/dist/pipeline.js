import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { runPhase1 } from "./phase1.js";
import { runPhase2 } from "./phase2.js";
import { runPhase3 } from "./phase3.js";
import { runPhase4 } from "./phase4.js";
import { defaultSquareTemplatePath, runPhase5 } from "./phase5.js";
export function runFullConvert(inputPath, outDir, options = {}) {
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
        throw new Error("pass both phase5Template and phase5Out, or neither (defaults apply when neither is set).");
    }
    let tmpl;
    let outSvg;
    if (pt !== null && po !== null) {
        tmpl = pt;
        outSvg = po;
    }
    else {
        const def = defaultSquareTemplatePath();
        if (def === null) {
            if (options.requireMergedSvg) {
                throw new Error("No SF Symbol square template found. Set SFSYMBOL_TEMPLATE_PATH " +
                    "or add resources/square_template.svg at the repository root.");
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
