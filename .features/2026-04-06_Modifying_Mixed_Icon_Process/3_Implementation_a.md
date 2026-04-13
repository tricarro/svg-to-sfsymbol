# Implementation summary: Mixed route three-layer stroke+fill preprocessing

**Plan:** `2_Plan_a.md` (this folder)  
**PRD:** `1_ProductRequirementsDocument_a.md`  
**Date:** 2026-04-06  

---

## What shipped

- **Phase 1:** Added `stripStrokeFromElement` (presentation attrs aligned with `phase4` stroke list; inline `style` drops keys whose name starts with `stroke`). Stroke+fill branch now emits: fill-only clone → `fillBoundaryToStrokedPathMarkup` (skipped for `text`) → stroke-only clone. Module comment updated for the three-layer contract and text exception.
- **Phase 2:** Replaced stroke+fill test with a fixture that separates representative stroke (`#f00` / width `8`) from the rect’s stroke (`black` / `2`), asserting substring order and boundary markup. Added test for stroke+fill `text`: two `<text>` nodes, no synthetic boundary `<path>`, `fill="red"` before `stroke="blue"`. Ran `npm test` and `npm run build` in `server/` — all green.

---

## Files touched

- `server/src/mixedIconToStrokedSvg.ts` — modified
- `server/src/mixedIconToStrokedSvg.test.ts` — modified
- `server/dist/mixedIconToStrokedSvg.js`, `server/dist/mixedIconToStrokedSvg.d.ts` (and any other `tsc` outputs that changed) — regenerated via `npm run build`

---

## Commands run

- `cd server && npm test` — 31 tests passed (6 files)
- `cd server && npm run build` — `tsc` succeeded

---

## Deviations

- None from `2_Plan_a.md`.

---

## Notes for QA / review

- Phase 4 / Phase 5 behavior with explicit fill-only layers should be validated on real mixed icons if templates are sensitive to surviving fills.
- Duplicate `id` on cloned siblings is still possible if source uses `id` on graphical elements; unchanged, out of plan scope.
- Plan Phase 3 manual spot-check was not run; defer to QA or follow-up.
