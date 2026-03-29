# PRD: Variable filled icon weight (Ultralight / Regular / Black)

**Status:** Draft  
**Date:** 2026-03-29  

---

## Problem statement

Filled SVGs merged into the SF Symbol variable template currently produce **identical** artwork in the three weight slots (`Ultralight-S`, `Regular-S`, `Black-S`). The pipeline copies the same normalized subtree into each slot, so variable symbols do not communicate weight the way designers expect. Without per-slot visual differentiation, the variable filled path underdelivers compared to native SF Symbols that read lighter or heavier across the weight axis.

---

## Goals & success criteria

- **Ultralight-S shows a visibly thinner silhouette than Regular-S** — verified by side-by-side inspection of merged SVG output at 112×112 normalization and, when applicable, in the SF Symbol authoring workflow.
- **Black-S shows a visibly heavier silhouette than Regular-S** — same verification as above.
- **Regular-S matches current baseline behavior** — verified by comparing merged output before/after change: Regular slot has no morphology filter (or equivalent) and matches the prior visual intent for the center weight.
- **Tuning is centralized** — fixed named constants in one place (e.g. module-level constants in `variableTemplateFilled.ts` or a small adjacent module); no env vars or API parameters in this version.
- **Automated regression guard** — tests assert that Ultralight and Black slots reference distinct morphology-based filters (or equivalent structure) and Regular does not, per extended `variableTemplateFilled.test.ts`.
- **Downstream compatibility checked once** — document outcome of importing merged SVG into the project’s typical SF Symbol export path; if filters are stripped, record as risk or follow-up (see open questions).

---

## User stories

- As a **designer converting a filled icon**, I want **Ultralight, Regular, and Black variable slots to look progressively heavier**, so that **the symbol responds to weight like system symbols**.
- As a **designer**, I want **Regular to stay the reference weight**, so that **my source art stays the anchor** and only the extremes are adjusted.
- As a **maintainer**, I want **magic numbers for erode/dilate strength in one place**, so that **tuning does not scatter** across the merge logic.
- As a **maintainer**, I want **tests that fail if all three slots become identical again**, so that **regressions are caught in CI**.
- As a **user of thin or detailed filled icons**, I accept that **Ultralight may weaken very fine features**, so that **I can choose source art or weight usage accordingly** (documented limitation).

---

## Out of scope / non-goals

- **No** stroke-width manipulation as the primary mechanism (filled paths are not inherently stroked; morphology is the chosen approach).
- **No** user-facing configuration (env vars, CLI flags, or HTTP options) for morphology strength in this version.
- **No** changes to non-variable filled pipeline phases beyond what is required to implement variable-template merge behavior.
- **No** new weight slots beyond the existing three (`Ultralight-S`, `Regular-S`, `Black-S`).
- **No** guarantee of perfect geometric accuracy versus hand-drawn weight masters; goal is **perceptible** differentiation, not pixel-identical match to Apple’s internal grids.
- **No** path-offset / clipper-based inset-outset in this PRD (defer unless morphology proves unsuitable in export).

---

## Constraints & risks

- **Implementation mechanism:** SVG `feMorphology` with **erode** on Ultralight, **identity** on Regular, **dilate** on Black. Filter definitions must be injected into merged document `defs` and applied per slot without breaking template structure expected by `mergeFilledIconIntoVariableTemplate`.
- **Coordinate system:** Icons are normalized to **112×112** user units before merge; tuning targets are stated as **~2 user units inward (Ultralight)** and **~4 user units outward (Black)** in spirit. Actual `feMorphology` `radius` values may not map 1:1 to “px” and must be set empirically during implementation.
- **Filter region / clipping:** Morphology can clip at filter primitive bounds; implementation must use appropriate `filterUnits`, `x`/`y`/`width`/`height`, or chaining so dilated edges are not cut off.
- **Export tooling:** Some SF Symbol or asset pipelines may **strip or ignore** SVG filters; success criteria include one manual verification pass; if filters fail, an open question records the fallback (e.g. document-only workaround or future phase).
- **Erode on thin geometry:** Small holes, hairlines, or counters may **disappear or merge** under erosion; accepted as a known limitation unless severity warrants a follow-up feature (minimum stroke width guard, etc.).

---

## Open questions

- **SF Symbol export:** Does the team’s standard import path preserve `feMorphology` (or filters in general)? If not, is acceptable follow-up documented-only, or does scope expand to a non-filter fallback?
- **Default radii:** What exact `radius` pair (Ultralight erode / Black dilate) ships first after visual review on 2–3 representative icons (simple solid, detailed, thin features)?
- **Accessibility of “vanished” detail:** Should Ultralight erosion be capped (e.g. maximum erode radius) to reduce broken icons, at the cost of less contrast with Regular?

---

## What changed in refinement (ideation → document)

- Stated the **current duplicate-slot behavior** explicitly as the problem root.
- Tied success criteria to **visibility**, **Regular baseline parity**, **central constants**, **tests**, and **one export check** instead of vague “better weights.”
- Scoped **non-goals** to config surface, other weights, and path-offset engines.
- Named **feMorphology**, **112×112 normalization**, **filter clipping**, and **export stripping** as concrete constraints and risks.
- Separated **open questions** (export path, numeric defaults, erosion cap) from committed scope.
