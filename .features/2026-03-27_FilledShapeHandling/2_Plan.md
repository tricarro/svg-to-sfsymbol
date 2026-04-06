# Implementation plan: Variable filled icon weight (feMorphology)

**Status:** Draft  
**PRD:** [1_ProductRequirementsDocument.md](1_ProductRequirementsDocument.md)  
**Date:** 2026-03-29  

---

## Overview

Per-slot **SVG `feMorphology`** filters will thin (erode) **Ultralight-S** and thicken (dilate) **Black-S** filled artwork after the existing normalize-and-place flow in [`mergeFilledIconIntoVariableTemplate`](../../../server/src/variableTemplateFilled.ts). **Regular-S** stays unchanged: same translated wrapper group with **no** `filter` attribute. Filter definitions are created once in the template document `defs` (alongside any merged icon `defs`); each slot’s content wrapper optionally references a stable `url(#id)`. Default erode/dilate radii are **fixed constants** in code, tuned visually against the PRD’s ~2 / ~4 user-unit intent at 112 normalization. Tests extend [`variableTemplateFilled.test.ts`](../../../server/src/variableTemplateFilled.test.ts) so CI fails if the three slots collapse to identical markup again.

---

## Architecture decisions

### Filter placement and IDs

Inject **two** `<filter>` elements into the merged SVG’s root `<defs>` (reuse [`ensureTemplateDefs`](../../../server/src/variableTemplateFilled.ts)) **after** `ensureTemplateDefs` runs and **before** filling slots. Use **namespaced IDs** (e.g. `svg2sfsym-morph-ultralight`, `svg2sfsym-morph-black`) so they do not collide with IDs imported from user icons via `mergeIconDefsInto`.

### Filter geometry (avoid clipping)

Use **`filterUnits="objectBoundingBox"`** with an expanded region (e.g. `x`, `y` negative fractions and `width`/`height` above `1`) so **dilate** does not clip at the wrapper’s bounding box. Keep the same region convention for erode for consistency. If a prototype still clips, widen the region before locking constants.

### Single primitive vs chain

Implement each weight filter as **`feMorphology`** with `in="SourceGraphic"` as the only primitive (or minimal chain) so output is clearly the morphed graphic. No stroke-width or path-offset logic in this plan.

### API surface

**No** new parameters on `mergeFilledIconIntoVariableTemplate` for this feature (matches PRD non-goals). Constants live beside the merge logic.

---

## File and folder changes

| Action | Path | Notes |
|--------|------|-------|
| Modify | [`server/src/variableTemplateFilled.ts`](../../../server/src/variableTemplateFilled.ts) | Constants, `ensureMorphologyFilters`, extend slot fill to apply `filter` by slot id |
| Modify | [`server/src/variableTemplateFilled.test.ts`](../../../server/src/variableTemplateFilled.test.ts) | Assertions on `filter` / `feMorphology` per slot |
| Optional | [`server/src/app.test.ts`](../../../server/src/app.test.ts) | Only if an integration test reads merged variable output and should assert filter presence; skip if redundant with unit tests |

---

## Component and interface design

### New module-level constants (same file)

- `MORPH_FILTER_ID_ULTRALIGHT`, `MORPH_FILTER_ID_BLACK` — string IDs for `url(#…)` references.
- `MORPH_ERODE_RADIUS` — number (or string for attribute) for Ultralight `feMorphology` `operator="erode"`.
- `MORPH_DILATE_RADIUS` — same for Black `operator="dilate"`.

Initial values: start from **erode `1`** / **dilate `2`** (or `2` / `4` if spec interpretation favors doubling) and **tune visually** on 2–3 icons; PRD allows empirical mapping from “~2 / ~4 user units.”

### New helper

`function ensureMorphologyFilters(defs: SvgElement, doc: SvgDocument): void`

- Idempotent: if filters with those IDs already exist, skip creation (defensive for tests or double-call).
- Appends two `<filter>` subtrees with the expanded `filterUnits` / region and child `feMorphology`.

### `fillSlotWithVisuals` signature change

Add parameter **`slotId: string`** (or `(typeof VARIABLE_SLOT_IDS)[number]`). After building the translate `wrap` `<g>`:

- If slot is **Regular-S**: append `wrap` unchanged (no `filter`).
- If **Ultralight-S**: set `wrap.setAttribute("filter", `url(#${MORPH_FILTER_ID_ULTRALIGHT})`)` (or wrap an inner `g` if you need translate and filter order — prefer **one** group with both `transform` and `filter` if renderers apply transform then filter consistently; validate visually).
- If **Black-S**: set `filter` to black morph URL.

Document in code comment: **transform + filter on same element** is acceptable if manual check shows correct placement; otherwise use nested `g` (translate outer, filter inner).

### `mergeFilledIconIntoVariableTemplate` sequence

1. Parse template, `ensureTemplateDefs`, **`ensureMorphologyFilters(templateDefs, templateDoc)`**.
2. `mergeIconDefsInto` when needed.
3. Loop slots: `fillSlotWithVisuals(slot, visual, templateDoc, iconCenterX, iconCenterY, id)`.

---

## Phased task sequence

### Phase 1 — Filter defs and slot wiring

- [ ] Add named constants and `ensureMorphologyFilters` in `variableTemplateFilled.ts` — **M**
- [ ] Call it from `mergeFilledIconIntoVariableTemplate` before the slot loop — **S**
- [ ] Extend `fillSlotWithVisuals` to accept slot id and apply `filter` only for Ultralight and Black — **M** — depends on: `ensureMorphologyFilters`

### Phase 2 — Verification and regression tests

- [ ] Manually compare merged SVG for a simple circle and a busier icon: Regular unchanged, Ultralight thinner, Black heavier — **S** — [deferrable] formal screenshot diff not required
- [ ] Extend `variableTemplateFilled.test.ts`: parse output or string-match that Ultralight/Black wrapper groups reference the two filter URLs, both defs contain `feMorphology` with `erode` vs `dilate`, and Regular’s inserted content group has **no** `filter` attribute — **M**
- [ ] Run `npm test` in `server` — **S**

### Phase 3 — Downstream note (PRD success criterion)

- [ ] Add a short note to the active feature doc or PRD open-questions area: one manual import of merged SVG into the usual SF Symbol workflow and whether filters survive — **S** — [deferrable] if no standard workflow exists, record “not verified” in a comment in `2_Plan.md` or feature README

---

## Risk flags and open technical questions

- **Filter order vs transform:** If combining `transform` and `filter` on one `<g>` misbehaves in Preview or target tool, switch to nested groups (translate outer, filter inner) and re-test — **validate in Phase 1 exit.**
- **Export strips filters:** If SF Symbol tooling drops `feMorphology`, implementation is still complete per PRD; follow-up is a new phase (non-filter fallback), not blocking this merge.
- **Radius choice:** Shipping defaults are a **visual** decision; document final numbers in a one-line comment next to constants after tuning.

---

## Out of scope

Matches PRD: no env/API tuning, no extra slots, no path-offset engine, no stroke-primary weighting, no changes to phase2/phase3/phase4 beyond what this merge path requires.

---

## What changed in refinement

- Mapped each PRD goal to concrete tasks (morphology defs, Regular baseline, constants, tests, manual/export note).
- Specified **idempotent** `ensureMorphologyFilters`, **collision-safe** IDs, and **objectBoundingBox** filter region to address clipping risk explicitly.
- Called out **transform vs filter** ordering as an early validation point.
- Marked manual visual check and SF Symbol import note as **[deferrable]** where they are process/documentation rather than code blockers.
- Split work into three phases: defs+wiring, tests+tuning, downstream documentation.
