import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { runSizeVariants } from "./steps/sizeVariants.js";
import { runWeightReplicas } from "./steps/weightReplicas.js";
import { runStrokeWidths } from "./steps/strokeWidths.js";
import { runStrokeToOutline } from "./steps/strokeToOutline.js";
import { defaultSquareTemplatePath, runSquareTemplateMerge, } from "./steps/squareTemplateMerge.js";
export function runFullConvert(inputPath, outDir, options = {}) {
    const input = String(inputPath);
    const out = String(outDir);
    if (!existsSync(input)) {
        throw new Error(`input not found: ${input}`);
    }
    const stem = basename(input).replace(/\.svg$/i, "");
    const p1 = runSizeVariants(input, out, { originalName: options.originalName });
    if (options.sizeVariantsOnly) {
        return {
            outDir: out,
            inputStem: stem,
            sizeVariantPaths: p1,
            mergedSvg: null,
            squareTemplateMergeStats: null,
        };
    }
    const p2 = runWeightReplicas(out);
    if (options.skipStrokeWidths) {
        return {
            outDir: out,
            inputStem: stem,
            sizeVariantPaths: p1,
            mergedSvg: null,
            squareTemplateMergeStats: null,
            weightReplicaPaths: p2,
        };
    }
    const p3 = runStrokeWidths(out);
    if (options.skipStrokeToOutline) {
        return {
            outDir: out,
            inputStem: stem,
            sizeVariantPaths: p1,
            mergedSvg: null,
            squareTemplateMergeStats: null,
            weightReplicaPaths: p2,
            strokeWidthCounts: p3,
        };
    }
    const p4 = runStrokeToOutline(out, options.outlineFlatness ?? 1);
    if (options.skipSquareTemplateMerge) {
        return {
            outDir: out,
            inputStem: stem,
            sizeVariantPaths: p1,
            mergedSvg: null,
            squareTemplateMergeStats: null,
            weightReplicaPaths: p2,
            strokeWidthCounts: p3,
            strokeToOutlineCounts: p4,
        };
    }
    const pt = options.squareTemplatePath != null ? String(options.squareTemplatePath) : null;
    const po = options.mergedSvgOutputPath != null ? String(options.mergedSvgOutputPath) : null;
    if ((pt === null) !== (po === null)) {
        throw new Error("pass both squareTemplatePath and mergedSvgOutputPath, or neither (defaults apply when neither is set).");
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
            if (options.requireMergedOutput) {
                throw new Error("No SF Symbol square template found. Set SFSYMBOL_TEMPLATE_PATH " +
                    "or add square_template.svg under build-pipeline/resources/.");
            }
            return {
                outDir: out,
                inputStem: stem,
                sizeVariantPaths: p1,
                mergedSvg: null,
                squareTemplateMergeStats: null,
                weightReplicaPaths: p2,
                strokeWidthCounts: p3,
                strokeToOutlineCounts: p4,
            };
        }
        tmpl = def;
        outSvg = join(out, `${stem}_SFSymbol.svg`);
    }
    const stats = runSquareTemplateMerge(tmpl, out, outSvg, {
        missing: options.missingSlotPolicy ?? "skip",
    });
    return {
        outDir: out,
        inputStem: stem,
        sizeVariantPaths: p1,
        mergedSvg: outSvg,
        squareTemplateMergeStats: stats,
        weightReplicaPaths: p2,
        strokeWidthCounts: p3,
        strokeToOutlineCounts: p4,
    };
}
