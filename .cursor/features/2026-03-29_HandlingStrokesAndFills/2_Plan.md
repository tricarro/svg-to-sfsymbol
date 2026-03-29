# Implementation plan: HandlingStrokesAndFills — mixed fill + stroke → single fill → variable template

**Status:** Approved for implementation  
**PRD:** None (conversation + prior architecture)  
**Date:** 2026-03-29

---

## Overview

Add a **mixed** upload path: icons with **both** visible strokes and visible fills are converted to a **single black-filled** path by **outlining strokes** (JSTS buffer, same family as `phase4`), **unioning** stroke outlines with **fill regions**, then running **`mergeFilledIconIntoVariableTemplate`**. **Stroke-only** icons keep the existing square-template pipeline; **fill-only** icons keep the current variable-template path unchanged.

---

## Architecture decisions

- **Routing:** `classifySvgRouting(xml)` → `"filled"` | `"stroked-only"` | `"mixed"` using the same heuristic scope as today (presentation attrs + inline `style`; skip `defs`).
- **Boolean:** Unary union of all collected geometries; single fill `#000000`; `fill-rule="evenodd"` when needed for multipolygon output.
- **Reuse:** Refactor `phase4` so stroke outline production returns JSTS `Geometry` before `d` serialization; add fill-region → `Geometry` for `path`, `polygon`, `polyline`, `rect`, `circle`, `ellipse`.
- **Limitations:** `stroke-dasharray`, nested fill holes via multiple subpaths (even-odd), and `transform` on shapes are not fully modeled; document in code and implementation notes.

---

## File & folder changes

| Action | Path |
|--------|------|
| Modify | `server/src/svgStrokeDetection.ts` — `classifySvgRouting`, `elementHasVisibleFill`, tests |
| Modify | `server/src/phase4.ts` — shared geometry builders + exports |
| Create | `server/src/mixedIconToFilled.ts` — `mixedIconToFillOnlySvg` |
| Create | `server/src/mixedIconToFilled.test.ts` |
| Modify | `server/src/app.ts` — branch `mixed` → preprocess → variable template |
| Modify | `README.md` — one-line routing note |

---

## Phased tasks (done in this implementation pass)

1. Routing + fill visibility helper aligned with `phase4` `visibleFill`.
2. `phase4` geometry exports: stroke outline + fill region per element type.
3. `mixedIconToFillOnlySvg`: walk icon, union, emit minimal SVG.
4. Wire `convertSync`; tests; `npm test`.

---

## Out of scope

- Stroked-only pipeline changes; full CSS/`use`/transform support; preserving multi-color artwork.
