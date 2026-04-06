# Code review: Filled icons + variable template (feMorphology)

**Reviewer:** cold read (no implementation involvement)  
**Scope:** `server/src/variableTemplateFilled.ts`, `variableTemplateFilled.test.ts`, `svgStrokeDetection.ts`, `app.ts` (filled routing + API errors)  
**Inputs:** PRD/plan present under `current/` · Implementation summary not required for this pass · Tests executed: `npm test -- --run` (19 passed)

---

## Orientation

**Reviewing:** Variable filled-icon merge with per-slot morphology filters and upload routing.  
**What was built:** Fill-only SVGs skip the stroked pipeline and merge into `square_variable_template.svg`, with erode on Ultralight-S, dilate on Black-S, and unfiltered Regular-S; morphology filters are idempotently ensured in `defs` with stable ids.  
**Starting review now.**

---

## Findings (by severity)

### Critical

None identified.

### Major

```
[Major] Edge cases & error states — Empty or non-painting filled SVG
File: server/src/variableTemplateFilled.ts (mergeFilledIconIntoVariableTemplate / fillSlotWithVisuals)
Issue: If the icon has no direct visual children (empty `<svg>`, only `<defs>`, or only elements `bakeVisualSubtree` does not meaningfully handle), `visual` can be empty. The code still removes the wireframe path and appends an empty wrapper group, producing a template with blank symbol slots and no error. Users get a misleading success response instead of a clear validation failure.
```

```
[Major] Edge cases & error states — Stroke detection vs stylesheet / `<use>`
File: server/src/svgStrokeDetection.ts
Issue: Classification only inspects presentation attributes and inline `style` on a fixed set of tags; it ignores `<style>` blocks, class-based rules, and `<use>` references. Stroked artwork that relies on CSS or symbol reuse can be routed down the filled path, yielding incorrect output without failing fast. This limitation is noted in the file header but remains a real misrouting risk for uploads.
```

```
[Major] Test coverage — Conditional skips when template absent
File: server/src/variableTemplateFilled.test.ts
Issue: Both tests return early when `square_variable_template.svg` is missing, so CI or clones without `resources/` can pass without exercising merge or filter behavior. Behavior is only guaranteed when that file exists.
```

### Minor

```
[Minor] Code quality — Unreachable or redundant guard
File: server/src/variableTemplateFilled.ts (lines 292–295)
Issue: After `buildVariantSvg(..., 112)`, the root viewBox is set to `0 0 112 112`, so `readViewBox` should always yield positive width/height. The `sw <= 0 || sh <= 0` check is effectively dead; it does not harm runtime but suggests stale logic relative to `buildVariantSvg`.
```

```
[Minor] Edge cases & error states — Wireframe path bbox helper vs segment types
File: server/src/variableTemplateFilled.ts (pathBBoxFromD)
Issue: Bbox accumulation relies on `svgpath`’s internal `segments` shape and an explicit command switch. It assumes `abs().unshort().unarc()` leaves only commands the loop handles. If a future `svgpath` revision emitted other segment types before normalization, extents could be wrong or stale current-point logic could under-approximate the box. Low likelihood if the library contract holds.
```

```
[Minor] API / UX — HTTP status mapping for merge failures
File: server/src/app.ts (POST /api/convert catch)
Issue: Several merge/template errors (e.g. missing slot, degenerate wireframe bbox) surface as 500. That may be appropriate for server/template misconfiguration but blurs distinction from user-invalid SVG where a 4xx might be clearer. Not incorrect, but operators may see more 500s than necessary.
```

### Suggestion

```
[Suggestion] Consistency — Download filename pattern
File: server/src/app.ts (convertSync)
Issue: Filled outputs use `stem-SFSymbol.svg` while stroked uses `stem_SFSymbol.svg`. Tests encode this as intentional; clients or docs should treat both patterns as expected to avoid confusion.
```

---

## Checklist notes

- **[PRD alignment]** — Aligned with plan: stable filter ids, `filterUnits="objectBoundingBox"` with expanded region, erode/dilate constants, Regular-S unfiltered, filters created before merging icon defs. No contradiction found.
- **[Plan alignment]** — Implemented as described in `2_Plan.md` (filters + per-slot `filter` attribute + tests).
- **[Code quality]** — Matches existing patterns (`phase5`-style slot fill, shared xml/phase1 helpers). No dead debug output observed.
- **[Security]** — XML parsing uses DOCTYPE strip + xmldom; no new injection surfaces identified; no hardcoded secrets. **Rule note:** No credentials or certificate material in scope.
- **[Performance]** — Single merge pass, three `importNode` walks over the same visual list; acceptable for upload-sized SVGs.
- **[Accessibility]** — Not applicable (no UI in these modules).

---

## Review summary

**Total issues:** 0 Critical · 3 Major · 3 Minor · 1 Suggestion

**Overall assessment:** The filled path is coherent with the existing phase5 placement model, morphology filters are wired safely with idempotent defs injection and collision-resistant ids, and the automated tests that run with the repo’s `resources/` file validate wireframe removal and per-slot filters. The main residual risks are heuristic misclassification of stroked CSS/`use` artwork, silent success when the icon produces no paintable output after normalization, and tests that do not run when the variable template file is absent.

---

## Resolution log

**Logged:** 2026-03-29  

**Author decision:** No code or test changes in this pass; findings stay on record for a later cycle.

**Triage:** All Major, Minor, and Suggestion items **deferred** (not rejected—may be picked up when hardening validation, stroke classification, CI guarantees, or API error semantics).

**Critical:** None were reported.

**Follow-up:** Run `/document` when you want `0_Overview.md` and the features index updated; skipped here because implementation was not modified.

---

**Review complete** (logged, no edits applied to the codebase).
