# Overview: Modifying mixed icon preprocessing (retain fill)

**Date completed:** 2026-04-06  
**Cycle status:** Failed (explicitly closed as unsuccessful)  
**Cycle artifacts:** `0_Overview.md`, `1_ProductRequirementsDocument.md`, `2_Plan.md`, `3_Implementation.md` — `4_Review.md` not produced

---

## What was built and why

The goal was to change mixed-route preprocessing so icons with **both** stroke and fill would **keep** native fill paint on the same element instead of stripping fill and appending a second path that traced the fill boundary as a stroke. That matched a product need for visual fidelity while leaving the HTTP `mixed` route and stroke-oriented square pipeline in place. Ideation produced a signed-off PRD, planning produced an approved task list, and implementation (in the original working session) updated `mixedIconToStrokedSvg` and tests so stroke+fill shapes passed through with fill intact.

**Failure (as recorded here):** The product owner marked this cycle **failed**. At documentation time the **repository no longer contains** that implementation: `server/src/mixedIconToStrokedSvg.ts` and its test again implement the **previous** behavior (strip fill from stroke+fill elements and add a boundary stroked path). No `/review` artifact was written. Treat this folder as the paper trail for intent and process, not as documentation of shipped behavior in `main`.

---

## How it works

Intended behavior (from the archived plan): in `mixedIconToStrokedSvg`, the branch for `elementHasVisibleStroke` and `elementHasVisibleFill` would call `serializeElement(el)` only, with fill-only sub-shapes in mixed SVGs still converted via `fillBoundaryToStrokedPathMarkup`. Routing via `classifySvgRouting` → `mixedIconToStrokedSvg` in `server/src/app.ts` would be unchanged.

**Current repo behavior:** See `server/src/mixedIconToStrokedSvg.ts` (clone, `stripFillFromElement`, optional boundary path) and `server/src/mixedIconToStrokedSvg.test.ts` (test title still references stripping fill).

---

## What was explicitly left out

Per PRD/plan: new upload routes, changing fill-only or stroke-only pipelines, baking transforms, and guarantees about Apple export quality beyond preprocessor output.

---

## Known limitations & gotchas

- Retaining fill while keeping a stroke-oriented downstream pipeline was flagged as a **risk** in the PRD; a failed cycle may indicate that combination did not prove viable in practice (exact reason not specified in-repo).
- Heuristic paint detection (`svgStrokeDetection`) and lack of group/transform bake apply to both the old and the attempted approach.

---

## Review findings & resolutions

**No formal review.** `4_Review.md` was not created (`/review` not run before the cycle was abandoned / reverted).

---

## Files touched (attempted implementation — not current tree)

When the change was applied in session, it touched: `server/src/mixedIconToStrokedSvg.ts`, `server/src/mixedIconToStrokedSvg.test.ts`, and regenerated `server/dist/mixedIconToStrokedSvg.*`. Those edits are **not** present at documentation time; recover from git history or the session transcript if needed.
