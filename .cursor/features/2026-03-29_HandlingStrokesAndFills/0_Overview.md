# Overview: HandlingStrokesAndFills

**Date completed:** 2026-03-29  
**Cycle artifacts:** `README.md`, `2_Plan.md`, `3_Implementation.md`, `3_Implementation_a.md`, `0_Overview.md` (this file). **Missing this cycle:** `1_ProductRequirementsDocument.md` (no `/ideate` PRD), `4_Review.md` (no `/review` run).

---

## What was built and why

The converter already sent **stroke-free** artwork to the **variable** SF Symbol template and **stroke-only** artwork through the **square** multi-weight pipeline. Icons that combine **visible fills and visible strokes** fit neither path well and could be double-painted when strokes were expanded next to filled paths. This cycle adds **mixed** detection and preprocessing: strokes are turned into filled outlines with the same **JSTS** buffering approach as phase 4, fill regions from common primitives are turned into polygons, everything is **boolean-unioned** into one black silhouette, and the result is merged with **`mergeFilledIconIntoVariableTemplate`** like other fill-only uploads. Users get a single predictable path through the variable template for mixed icons.

---

## How it works

- **`classifySvgRouting`** in [`server/src/svgStrokeDetection.ts`](../../../server/src/svgStrokeDetection.ts) walks the SVG (skipping `defs`), using presentation attributes and inline `style` only. It sets **`mixed`** when both a visible stroke and a visible fill appear on the scanned graphical tags; **`stroked-only`** when only strokes; **`filled`** otherwise.
- **`mixedIconToFillOnlySvg`** in [`server/src/mixedIconToFilled.ts`](../../../server/src/mixedIconToFilled.ts) collects those elements, calls **`strokeElementToOutlineGeometry`** and **`fillElementToGeometry`** from [`server/src/phase4.ts`](../../../server/src/phase4.ts), unions with **`unionJtsGeometries`**, serializes with **`jtsGeometryToSvgPathD`**, and emits a minimal **`#000000`** SVG.
- **`convertSync`** in [`server/src/app.ts`](../../../server/src/app.ts) routes **`filled`** and **`mixed`** through the variable template (mixed after preprocessing); **`stroked-only`** still uses **`runFullConvert`** and the square template.
- Tests live in **`svgStrokeDetection.test.ts`** (routing) and **`mixedIconToFilled.test.ts`**. [`README.md`](../../../README.md) documents upload routing.

---

## What was explicitly left out

Per plan: no change to the stroke-only square pipeline; no full CSS, `<use>`, or transform baking; no preserving multiple fill colors after union. No standalone PRD artifact for this cycle.

---

## Known limitations & gotchas

- **`stroke-dasharray`:** outline conversion is skipped (same as phase 4); mixed icons with dashes may error or omit those strokes.
- **Complex fill topology:** multiple subpaths are unioned additively; even-odd “holes” are not modeled as subtractive booleans.
- **Transforms** on child geometry are not applied in the mixed preprocessor; icons should live in user space or be pre-flattened.
- **HTTP:** failures inside **`mixedIconToFillOnlySvg`** currently tend to surface as **500** unless mapped to **400** in the API layer.

---

## Review findings & resolutions

No **`4_Review.md`** was produced for this cycle, so there is no formal cold review record. Follow-up items called out in implementation notes (dashes, holes, transforms, status codes) remain as manual QA / future work.

---

## Files touched

From implementation summaries: **`server/src/svgStrokeDetection.ts`**, **`server/src/svgStrokeDetection.test.ts`**, **`server/src/phase4.ts`**, **`server/src/mixedIconToFilled.ts`**, **`server/src/mixedIconToFilled.test.ts`**, **`server/src/app.ts`**, **`README.md`**. Feature docs under **`.cursor/features/current/`** (and the dated folder **`2026-03-29_HandlingStrokesAndFills/`** via symlink): **`2_Plan.md`**, **`3_Implementation.md`**, **`3_Implementation_a.md`** (TypeScript **`Geometry`** import fix in **`mixedIconToFilled.ts`**).
