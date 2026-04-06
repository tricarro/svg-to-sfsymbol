# Overview: Variable filled icon weight (Ultralight / Regular / Black)

**Date completed:** 2026-03-29  
**Cycle artifacts:** `0_Overview.md`, `1_ProductRequirementsDocument.md`, `2_Plan.md`, `3_Implementation.md`, `4_Review.md` (under `.cursor/features/2026-03-27_FilledShapeHandling/`)

---

## What was built and why

Fill-only SVGs merged into the SF Symbol **variable** template used to drop the **same** artwork into **Ultralight-S**, **Regular-S**, and **Black-S**, so the weight axis did not read. This cycle adds **per-slot differentiation**: **Ultralight** is lighter (smaller + erode), **Regular** stays the baseline (112-unit layout, no filter), **Black** is heavier (larger + dilate). The goal is closer to how native variable symbols feel without hand-drawing three masters.

---

## How it works

- **Normalization:** The upload is still normalized once with [`buildVariantSvg`](../../../server/src/phase1.ts) to **`VARIABLE_ICON_BASE_SIDE` (112)** user units.
- **Morphology:** [`variableTemplateFilled.ts`](../../../server/src/variableTemplateFilled.ts) injects two idempotent `<filter>` definitions under the template root `<defs>` (`svg2sfsym-morph-ultralight` / `svg2sfsym-morph-black`) using **`feMorphology`** (**erode** / **dilate**) with fixed radii. Filters use **`filterUnits="objectBoundingBox"`** and an expanded region (`-0.5`, `-0.5`, `2`, `2`) so **dilate** is not clipped at the slot bounds. Filters are registered **before** merging the icon’s own `<defs>` so stable IDs are not overridden by user content.
- **Per-slot wrapper:** Each slot still removes the wireframe path and inserts a translated `<g>` with the icon visuals. **Ultralight-S** and **Black-S** set **`filter="url(#…)"`** on that group; **Regular-S** does not.
- **Per-slot scale:** **Ultralight** uses uniform scale **104/112**, **Black** **120/112**, **Regular** **1**, applied **around the icon center** via `translate(tx ty) translate(cx cy) scale(s) translate(-cx -cy)` so alignment with the template wireframe center is preserved.
- **Tests:** [`variableTemplateFilled.test.ts`](../../../server/src/variableTemplateFilled.test.ts) checks filter defs, `erode`/`dilate`, per-slot `filter` attributes, and presence/absence of **`scale(`** in the wrapper transform.

---

## What was explicitly left out

- No env vars or API knobs for morphology or scale (per PRD).
- No path-offset / clipper inset-outset engine.
- No change to the stroked (square template) pipeline beyond what already existed for fill detection.
- **Manual SF Symbol import check** (whether export preserves filters) was not completed in this cycle.
- **Review findings** (empty filled SVG, CSS/`use` stroke classification, conditional template skips, HTTP 4xx vs 500) were **deferred** with no code changes in the review pass.

---

## Known limitations and gotchas

- **Filters in downstream tools:** Some SF Symbol or asset steps may strip **`feMorphology`**; verify in your real workflow.
- **Erode + thin geometry:** Very fine details may weaken or disappear on Ultralight.
- **Morphology after scale:** The filter runs on the **scaled** subtree; tuning **radii** and **104/120** may need to be done together.
- **Stroke detection:** Stroked art that relies on **CSS** or **`<use>`** can still be misclassified as fill-only (pre-existing limitation noted in review).
- **Variable tests** skip when [`resources/square_variable_template.svg`](../../../resources/square_variable_template.svg) is missing.

---

## Review findings and resolutions

Cold read recorded in [`4_Review.md`](4_Review.md): **0 Critical**, **3 Major**, **3 Minor**, **1 Suggestion**. **Author decision:** no code changes in that pass; all items **deferred** for a later hardening cycle (validation for empty visuals, classification breadth, CI template guarantee, optional status-code polish, filename pattern docs).

---

## Files touched

| File | Role |
|------|------|
| [`server/src/variableTemplateFilled.ts`](../../../server/src/variableTemplateFilled.ts) | Morphology filters, per-slot `filter`, per-slot scale transform helpers, constants |
| [`server/src/variableTemplateFilled.test.ts`](../../../server/src/variableTemplateFilled.test.ts) | Filter and scale regression assertions |
| [`1_ProductRequirementsDocument.md`](1_ProductRequirementsDocument.md) | PRD |
| [`2_Plan.md`](2_Plan.md) | Implementation plan |
| [`3_Implementation.md`](3_Implementation.md) | Implementation summary (updated for scale) |
| [`4_Review.md`](4_Review.md) | Code review log |
