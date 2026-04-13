# PRD: Retain fill on mixed stroke+fill preprocessing

**Status:** Approved  
**Date:** 2026-04-06  

---

## Problem statement

Mixed SVGs (classified as `mixed` because the document has both visible strokes and visible fills) are preprocessed by `mixedIconToStrokedSvg` before the square, stroke-oriented SF Symbol pipeline. For any graphical element that has **both** a visible stroke and a visible fill, the implementation today removes the fill from a serialized copy and appends a separate path that traces the fill boundary as a stroked outline. That loses the original filled appearance (solid, gradient, or pattern fill) and duplicates geometry. The desired behavior is to keep the fill on those elements while preserving their strokes so preprocessing no longer strips fill or replaces it with an outline-only duplicate for that case.

---

## Goals & success criteria

- For each graphical element where `elementHasVisibleStroke` and `elementHasVisibleFill` are both true, the preprocessor emits that element (or an equivalent serialization) with **fill-related attributes and inline styles retained** (including `fill`, `fill-rule`, `fill-opacity`, and corresponding `style` entries) and **stroke-related paint retained** on the same element.
- For those same elements, the preprocessor **does not** append an extra `<path>` produced by `fillBoundaryToStrokedPathMarkup` (fill boundary as a separate stroked outline).
- The HTTP upload flow for `classifySvgRouting` → `mixed` continues to run: mixed XML → `mixedIconToStrokedSvg` → existing square pipeline bytes, with **no new routing branch** required for this change.
- Verification: a **manual** mixed test icon supplied by the product owner shows **fills still present** in the preprocessor output (e.g. expected `fill` values or defs references still present on stroke+fill shapes) while strokes remain on those shapes; automated tests are updated so the previous “strip fill + boundary path” expectations for stroke+fill elements are replaced with assertions that match the new contract.

---

## User stories

- As a designer converting mixed icons, I want stroke+fill shapes to keep their fills through mixed preprocessing, so that filled areas do not disappear or turn into outline-only duplicates.
- As a designer, I want strokes on those same shapes to remain applied, so the icon still reads as stroked where I authored stroke paint.
- As a maintainer, I want fill-only shapes **within** an otherwise mixed document to keep the existing fill-to-stroked-boundary behavior, so the overall document remains compatible with the stroke-oriented square pipeline for regions that have no stroke.
- As a maintainer, I want stroke-only shapes within a mixed document to pass through unchanged, so unrelated elements are not affected.
- As a tester, I want unit tests for `mixedIconToStrokedSvg` to assert the new stroke+fill behavior explicitly (e.g. a `rect` or `path` with both `fill` and `stroke` still shows `fill` in the output and does not gain a redundant boundary-only path for that element).
- As an API consumer, I want the `mixed` conversion route and response shape (SVG payload into the pipeline) to stay the same at the HTTP level, so clients do not need changes beyond any visual outcome differences.

---

## Out of scope / non-goals

- Changing how uploads are classified (`filled` vs `stroked-only` vs `mixed`) or adding a new route.
- Changing preprocessing for **fill-only** icons on the dedicated filled path or **stroke-only** icons.
- Changing the behavior for graphical elements that have **fill but no visible stroke** inside a mixed SVG (they continue to be converted to stroked boundary paths using representative stroke width/color).
- Baking or flattening group transforms, clip paths, masks, or filters beyond what the current preprocessor already does or does not do.
- Guaranteeing SF Symbol template or Apple toolchain output quality for every edge case; this PRD only defines preprocessor output contract and regression tests.

---

## Constraints & risks

- The square pipeline remains **stroke-oriented**; retaining fill on stroke+fill elements assumes the downstream step tolerates filled geometry alongside strokes on those elements. Risk: visual or tooling regressions on specific icons; mitigation is manual testing with representative mixed assets and updated unit tests.
- Elements with both stroke and fill may draw fill and stroke in one pass where previously fill was represented as a second stroked outline; appearance may change relative to the old heuristic (intended improvement for fidelity to source fill).
- `text` elements with both stroke and fill: today fill is stripped and no boundary path is added; with this change, fill should be retained consistently with other graphical tags unless a documented exception is added later.

---

## Open questions

- None blocking for the scoped change (stroke+fill elements only; fill-only-within-mixed unchanged). If you later want **all** paints in mixed SVGs to remain native fills (including fill-only sub-shapes), that would be a separate scope change against the stroke-oriented pipeline assumption.
