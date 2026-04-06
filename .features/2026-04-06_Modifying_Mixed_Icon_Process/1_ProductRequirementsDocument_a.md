# PRD: Mixed route — three-layer stroke+fill preprocessing

**Status:** Approved  
**Date:** 2026-04-06  

---

## Problem statement

Mixed icons (same graphical element has visible fill and visible stroke) need a preprocessor that feeds the existing square (stroked) pipeline without losing fill coverage before Phase 4. Emitting only a stroke-only copy or only a pass-through of the combined element does not match the desired geometry stack: the filled region must remain explicit through early phases, while a separate stroked outline of the fill boundary and the element’s own stroke are also present so Phase 4 can expand strokes under the same rules as today. This update applies to the **current mixed route** only (no new parallel mode or endpoint).

---

## Goals & success criteria

- For every graphical element classified as mixed (visible stroke and visible fill), the preprocessor output contains **three explicit contributions** in a defined order: (1) a **fill-only** representation preserving the element’s fill paint, (2) a **duplicate geometry** with fill removed and a **stroke on the fill boundary** using width and color from `representativeStrokeStyleForMixedPreprocess` (same heuristic as today’s mixed stroked path), (3) a **stroke-only** representation preserving the element’s stroke paint with fill removed.
- **Document order** matches **paint order intent**: fill-only first, then fill-boundary stroke path, then stroke-only copy (later siblings paint on top in SVG).
- **Downstream contract:** After Phase 4 runs on the weight SVGs, behavior remains aligned with the **mixed stroked** pipeline (stroke expansion via existing Phase 4 logic), not with the variable-template **`mixedIconToFillOnlySvg`** unary-union-to-single-fill contract.
- **Regression safety:** Existing behaviors for **stroke-only** and **fill-only** elements inside a mixed SVG stay unchanged unless this PRD explicitly changes them.
- **Verification:** Unit tests on `mixedIconToStrokedSvg` assert presence and ordering of the three layers for a representative `rect` or `path` with stroke+fill; stroke-only and fill-only branches remain covered; tests fail if the fill-only or stroke-only layer is missing or if the boundary path uses a non-representative stroke source.

---

## User stories

- As an icon author using the mixed route, I want stroke+fill shapes split into **fill-only**, **boundary-outlined**, and **stroke-only** pieces, so that fill remains in the SVG until Phase 4 expands strokes like the rest of the square pipeline.
- As a maintainer, I want the **representative stroke** heuristic unchanged for the generated fill-boundary stroke, so behavior stays consistent with the current mixed stroked preprocessor.
- As a maintainer, I want **no new routing flag or alternate endpoint**, so the mixed upload path stays a single code path with an updated preprocessor.
- As a maintainer, I want **fill-only** sub-shapes in a mixed file to keep using **fill boundary → stroked path** conversion as they do today, so only the stroke+fill branch gains the three-layer stack.
- As a tester, I want tests to pin **order and attributes** (fill present on layer 1, `fill="none"` and rep stroke on layer 2, stroke present and fill absent on layer 3) so accidental reordering or merging in the preprocessor is caught.
- As a product owner, I want this PRD to **supersede** the prior decision to use **pass-through only** (`serializeElement(el)` with no boundary duplicate) for stroke+fill on the mixed stroked route, so planning and implementation reference one intended stack.

---

## Out of scope / non-goals

- Adding a second user-visible mode, query parameter, or alternate HTTP route for mixed icons.
- Changing **`mixedIconToFillOnlySvg`** or the variable-template mixed path.
- Changing **`classifySvgRouting`** or when an SVG is labeled mixed.
- Introducing a **global unary union** in Phase 4 that mirrors `mixedIconToFillOnlySvg` unless a later plan shows it is required for correctness.
- Baking **group transforms**, normalizing **stroke-dasharray**, or expanding support beyond current mixed limitations (same caveats as today’s `mixedIconToStrokedSvg` module comment).

---

## Constraints & risks

- **Implementation:** Requires reliable **strip-fill** and **strip-stroke** (including inline `style`) helpers analogous to existing patterns, without dropping unrelated presentation.
- **Phase 4:** Only elements that satisfy **`elementIsStroked`** undergo stroke-to-outline conversion; fill-only layers remain until some later stage—risk of mismatch with template expectations if fills are not consumed as assumed (mitigation: validate with real assets and phase 5 output).
- **Representative stroke** is a heuristic: multi-width icons may not match per-edge intent on the boundary path.
- **Text:** Vector text with stroke+fill may not admit the same boundary geometry as paths; behavior may need to match prior special-casing (e.g. skip synthetic boundary path).

---

## Open questions

- For **`text`** elements with both stroke and fill, should the preprocessor emit **only** fill-only + stroke-only (no `fillBoundaryToStrokedPathMarkup`), matching the historical `localTag(el) !== "text"` guard, or should text attempt a boundary path as well?
- If **fill-opacity** or **semi-transparent** fills are present, should the fill-only layer preserve them exactly, or is **opaque approximation** acceptable for this version?
