# Implementation plan: Mixed route three-layer stroke+fill preprocessing

**Status:** Approved  
**PRD:** `1_ProductRequirementsDocument_a.md`  
**Date:** 2026-04-06  

---

## Overview

Update `mixedIconToStrokedSvg` so elements with visible stroke and fill emit **three serialized pieces in order**: fill-only clone, synthetic boundary path stroked with **representative** width/color, then stroke-only clone. Fill-only and stroke-only branches stay as they are. Extend unit tests to lock order and representative stroke on the boundary path. No HTTP or routing changes; rebuild `server/dist` if the repo tracks it.

---

## Architecture decisions

### Stroke+fill emission order

Use **document order** `fill-only → fillBoundaryToStrokedPathMarkup → stroke-only` so paint order matches the PRD (fill under, boundary stroke, original stroke on top).

### Strip helpers

Add **`stripStrokeFromElement`** beside `stripFillFromElement`, mirroring the same pattern: remove stroke-related presentation attributes and strip `stroke*` entries from inline `style` without removing unrelated properties. Align attribute coverage with `stripStrokePresentation` in `phase4.ts` (`stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `stroke-miterlimit`, `stroke-dasharray`, `stroke-dashoffset`, `stroke-opacity`) so behavior stays consistent with how strokes are modeled elsewhere. Keep helpers **local** to `mixedIconToStrokedSvg.ts` unless a second caller appears.

### Text and stroke+fill

Resolve PRD open question by **matching historical behavior**: for `text` with stroke+fill, emit **fill-only** then **stroke-only** only—**no** `fillBoundaryToStrokedPathMarkup` (same guard as today: `localTag(el) !== "text"`).

### Fill-opacity / transparency

Resolve PRD open question by **preserving** fill paint on the fill-only clone: do not strip `fill-opacity` (or other fill keys) when building that layer; no approximation in this change set.

---

## File & folder changes

| Action | Path | Notes |
|--------|------|-------|
| Modify | `server/src/mixedIconToStrokedSvg.ts` | `stripStrokeFromElement`, reorder stroke+fill branch, update file comment |
| Modify | `server/src/mixedIconToStrokedSvg.test.ts` | Stroke+fill expectations + ordering / rep stroke fixture |
| Modify | `server/dist/*` | Regenerate if committed |

---

## Phased task sequence

### Phase 1 — Preprocessor logic

- [ ] Implement `stripStrokeFromElement` (attrs + `style` stroke-prefixed keys) — S
- [ ] Replace `hasS && hasF` branch: `deepClone` + strip stroke → push; if not `text`, push `fillBoundaryToStrokedPathMarkup(el, flatness, repW, repColor)`; second `deepClone` + strip fill → push — S — depends on: strip helper
- [ ] Update module-level comment to describe three-layer stroke+fill output and unchanged fill-only / stroke-only behavior — S

### Phase 2 — Tests and build

- [ ] Rewrite or extend stroke+fill test: assert **substring order** (fill-only layer before boundary `<path` before stroke-only layer) using a fixture where **representative** stroke differs from the rect’s own stroke (e.g. earlier path with larger `stroke-width` / distinct color so boundary path must show rep values) — M — depends on: Phase 1
- [ ] Keep or lightly adjust fill-only and stroke-only assertions so they still match unchanged branches — S — depends on: Phase 1
- [ ] Add focused test for `text` stroke+fill: exactly **two** fragments, no synthetic boundary path, fill-only before stroke-only — M — depends on: Phase 1
- [ ] Run server tests (`vitest`); run TypeScript build so `server/dist` matches `src` if dist is committed — S — depends on: tests green

### Phase 3 — Spot-check

- [ ] Run one mixed SVG with stroke+fill through the app or `mixedIconToStrokedSvg` and visually confirm stacking — S — [deferrable] if unit tests are trusted

---

## Risk flags & open technical questions

- **Fill-only layers in Phase 4:** Strokes expand to outlines; fills may survive until later phases—watch template / Phase 5 on real assets (PRD-accepted risk).
- **Duplicate `id` attributes:** If cloned elements carry `id`, duplicate IDs in one SVG are invalid; only add handling if real inputs hit this—out of scope unless discovered in QA.

---

## Out of scope

Per PRD: new routes or modes, `mixedIconToFillOnlySvg`, `classifySvgRouting`, Phase 4 global unary union, transform bake, dasharray support, expanding graphical tag support beyond current set.
