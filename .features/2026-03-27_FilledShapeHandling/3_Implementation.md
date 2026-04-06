# Implementation: Variable filled icon weight

**Date:** 2026-03-29  
**Plan:** [2_Plan.md](2_Plan.md)

## Summary

- Added **`feMorphology`** filters in [`server/src/variableTemplateFilled.ts`](../../../server/src/variableTemplateFilled.ts): `svg2sfsym-morph-ultralight` (erode) and `svg2sfsym-morph-black` (dilate), with **fixed tunable radii** in user space (see `MORPH_ERODE_RADIUS` / `MORPH_DILATE_RADIUS` in source; initial PRD target was ~2 / ~4, values may be adjusted visually). Filter region uses **`filterUnits="objectBoundingBox"`** with `x/y/width/height` **-0.5 / -0.5 / 2 / 2** to limit dilate clipping.
- **`ensureMorphologyFilters`** runs after **`ensureTemplateDefs`** and **before** **`mergeIconDefsInto`** so reserved IDs are present first.
- **`fillSlotWithVisuals`** takes **`slotId`** and sets **`filter="url(#…)"`** on the content wrapper only for **Ultralight-S** and **Black-S**; **Regular-S** unchanged.
- **Per-slot uniform scale** (same session, follow-up): **`VARIABLE_ULTRALIGHT_SIDE = 104`**, **`VARIABLE_BLACK_SIDE = 120`**, baseline **`VARIABLE_ICON_BASE_SIDE = 112`**. **`slotContentTransform`** composes **translate** + **scale about icon center** so the silhouette stays centered in the wireframe box.
- Tests in [`server/src/variableTemplateFilled.test.ts`](../../../server/src/variableTemplateFilled.test.ts): assert defs contain both filters and morph operators; per-slot wrapper checks **filter** on Ultra/Black and **no filter** on Regular; **scale(** present on Ultra/Black only.

## Verification

- `cd server && npm test` — all 19 tests passed.

## Not done here

- Manual SF Symbol import check (plan Phase 3 / PRD open question) — still optional.
