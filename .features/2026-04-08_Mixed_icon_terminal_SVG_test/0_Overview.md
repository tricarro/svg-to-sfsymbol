# Overview: Mixed-icon Paper.js terminal test

**Date completed:** 2026-04-10  
**Cycle artifacts:** `0_Overview.md`, `1_ProductRequirementsDocument.md`, `2_Plan.md`, `3_Implementation.md` — no `4_Review.md` (review skill not run)

---

## What was built and why

The main svg-to-sfsymbol pipeline was intentionally left alone. This cycle added a **standalone experiment** under `tests/mixedIcon`: a small **Node + Paper.js** CLI that reads an SVG, finds filled path-like shapes Paper imports, **duplicates** each one, removes fill on the copy, strokes the copy using the original fill color (with fallbacks for gradients and edge cases), forces a uniform **stroke width** on every stroked path, and writes a single output SVG so **fills and stroked outlines** can be compared in one file. The goal was a repeatable terminal workflow for mixed stroke/fill icons, not production integration.

---

## How it works

Run from `tests/mixedIcon` after `npm install`: `node process.mjs <input.svg> [output.svg]`. **Paper** loads with **`canvas`** (headless surface) and **`jsdom`** so `importSVG` has a `DOMParser`. The script collects top-level **`Path`** / **`CompoundPath`** items with a non-empty fill, clones each with **`insertAbove`** the original, clears **`fillColor`** on the clone, sets **`strokeColor`** from the fill, runs a second pass to set **`strokeWidth`** to **21** on all path-like items that have a stroke, then **`exportSVG`** with **`bounds: 'content'`**. Default output path is `basename-out.svg` beside the input. See `tests/mixedIcon/README.md` and `process.mjs` for details.

---

## What was explicitly left out

Per PRD/plan: no hook into the main server or product CLI; no support beyond what Paper exposes as path geometry; no full SVG/CSS stylesheet semantics; no CI or automated visual regression. Formal **code review** (`/review`) was not executed this cycle.

---

## Known limitations & gotchas

- **v1 fill detection:** Only presentation / inline fills that survive Paper import count; CSS-only fills on paths are invisible to this script.
- **Round-trip:** Import/export can change `d` syntax, add clip wrappers, and alter attributes; geometry is not guaranteed to match the source byte-for-byte.
- **Native `canvas`:** Install may require OS build tools; `canvas@3` plus **`legacy-peer-deps`** (via `.npmrc`) avoids a peer conflict with `jsdom@25` and broken `canvas@2` prebuilds on some Node/OS combos.
- **Small filled shapes + thick stroke:** Stacking a **filled** path under a **stroked** duplicate of the same outline can show **light rings or gaps** (background showing between fill and inner stroke edge), especially on tiny circles, because the stroke is an annulus centered on the path and Paper/SVG math may not align perfectly with the fill after round-trip.

---

## Review findings & resolutions

No **`4_Review.md`** was produced; no formal review pass was run. QA notes from implementation (`3_Implementation.md`) stand as the main post-ship checklist.

---

## Files touched

See **`3_Implementation.md`** for the authoritative list. In short: `tests/mixedIcon/package.json`, `package-lock.json`, `.npmrc`, `.gitignore`, `process.mjs`, `README.md`, `imgs/sample.svg`.
