# Implementation summary: Filled-icon detection and variable-template conversion

**PRD:** `1_ProductRequirementsDocument.md`  
**Plan:** `2_Plan.md`  
**Date:** 2026-03-28

---

## What shipped

- **Phase 1 — Detection:** `server/src/svgStrokeDetection.ts` classifies parsed SVG as `stroked` or `filled` by scanning graphical elements outside `defs` for a visible stroke (presentation attributes + simple inline `style` for `stroke` / `stroke-width`). Vitest coverage in `svgStrokeDetection.test.ts`.
- **Phase 2 — Variable merge:** `server/src/variableTemplateFilled.ts` reads `resources/square_variable_template.svg` (or `SFSYMBOL_VARIABLE_TEMPLATE_PATH`), normalizes the icon with existing `buildVariantSvg(..., 112)`, merges defs, fills `Ultralight-S` / `Regular-S` / `Black-S` with translate-only centering (wireframe `path` removed per slot). Vitest in `variableTemplateFilled.test.ts`.
- **Phase 3 — HTTP:** `convertSync` in `app.ts` branches on classification; filled path returns `{stem}-SFSymbol.svg`. Missing variable template errors map to 503 (message includes `SFSYMBOL_VARIABLE_TEMPLATE_PATH` or `No SF Symbol variable template`). `app.test.ts` covers fill-only `convertSync` and keeps stroked tests.
- **Phase 4 — Docs:** Root `README.md` updated for auto-routing, both templates, env vars, download naming, and implementation table row.

---

## Files touched

| Action | Path |
|--------|------|
| Create | `server/src/svgStrokeDetection.ts` |
| Create | `server/src/svgStrokeDetection.test.ts` |
| Create | `server/src/variableTemplateFilled.ts` |
| Create | `server/src/variableTemplateFilled.test.ts` |
| Modify | `server/src/app.ts` |
| Modify | `server/src/app.test.ts` |
| Modify | `README.md` |

---

## Commands run

- `cd server && npm test` — 18 tests passed (4 files).
- `cd server && npm run build` — `tsc` succeeded.

---

## Deviations

- **Duplicated** `pathBBoxFromD` and slot helpers in `variableTemplateFilled.ts` instead of extracting a shared module from `phase5.ts` (plan allowed either; kept `phase5` unchanged to minimize churn).
- **Tests** assert absence of wireframe via regex `<path…SFSymbolsPreviewWireframe` because the template `<style>` block still mentions the class name string.

---

## Notes for QA / review

- Manually verify a fill-only icon in **Xcode 26+** / SF Symbols against `square_variable_template.svg` expectations.
- **Edge cases:** `<use>` to external defs with stroke, `display:none`, and complex stylesheets are not fully modeled; may misroute or miss strokes.
- **Mixed** stroke+fill geometry: first matching stroke wins `stroked` classification per PRD non-goal.
- Web client unchanged; download filename pattern differs by branch (`_` vs `-` before `SFSymbol.svg`).
