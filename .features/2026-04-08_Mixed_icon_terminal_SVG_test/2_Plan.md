# Implementation plan: Mixed-icon Paper.js terminal test

**Status:** Approved  
**PRD:** `.features/current/1_ProductRequirementsDocument.md`  
**Date:** 2026-04-09  

---

## Overview

Add an isolated Node toolchain under `tests/mixedIcon` that reads an SVG, uses Paper.js (with `canvas` for a headless surface) to import the graphic, duplicates each filled `<path>`-backed item as a stroked outline with `fill` cleared, normalizes every stroked path’s width to `21` user units, preserves originals so both layers are visible (duplicates drawn after their originals), and writes a single output SVG. CLI usage, explicit errors, and a short local README complete the loop without touching the main app.

---

## Architecture decisions

### Paper.js as the single transform engine

Use `paper.setup(createCanvas(w, h))` (from `canvas`) and `project.importSVG()` so geometry, groups, and transforms stay inside Paper’s model. Avoid hand-parsing `d` attributes for duplication; accept that exported SVG may not byte-match the input (PRD risk).

### Filled-path rule (v1)

Treat an imported item as “filled” when it is a `Path` or `CompoundPath` (or equivalent leaf with path geometry) and it has a non-empty fill: Paper `fillColor` effective and not equivalent to transparent/none. Document that stylesheet-only fills (no presentation attributes on import) are out of scope for v1—inline or imported presentation fills only.

### Open questions resolved for implementation

- Duplicate stroke color: use the source path’s fill color; if fill is `currentColor` or otherwise not resolved to a concrete color after import, use `black`.
- Stroke width `21`: apply to every item that has a stroke after processing (original stroked paths and new duplicates), per PRD success criteria.

### Layer order

After creating each duplicate, insert it immediately after its original in the same parent (or rely on Paper’s child order after `clone()` + `insertBelow`/`insertAbove` as needed) so duplicates render on top of their originals; note the exact choice in `3_Implementation.md` during implement.

---

## File & folder changes

| Action | Path | Notes |
|--------|------|-------|
| Create | `tests/mixedIcon/package.json` | `type: module`, scripts, pinned deps |
| Create | `tests/mixedIcon/package-lock.json` | Via `npm install` in that directory |
| Create | `tests/mixedIcon/process.mjs` | Entry CLI (plain ESM avoids TS build for this sandbox) |
| Create | `tests/mixedIcon/README.md` | Install, run command, inputs/outputs, limitations |

---

## Phased task sequence

### Phase 1 — Toolchain scaffold

- [ ] Add `package.json` with dependencies `paper`, `canvas`, and dev/runtime script using Node ESM — M — pins versions; add `"type": "module"` and a `npm start` / `node process.mjs` script — S
- [ ] Run `npm install` under `tests/mixedIcon` and commit lockfile — S — depends on: `package.json`
- [ ] Smoke-test `paper` + `canvas` on this machine (minimal script that creates a canvas and calls `paper.setup`) — S — depends on: install

### Phase 2 — SVG processing core

- [ ] Implement SVG read + `project.importSVG(svgString, { insert: true, applyMatrix: true })` (or documented equivalent) after `paper.setup` — M
- [ ] Traverse `project` (e.g. `project.getItems({ class: Path })` and include compound paths) and collect candidates with a documented `hasOpaqueFill`-style check — M — depends on: import
- [ ] For each candidate: `clone()`, clear fill on clone, set `strokeColor` from original fill (fallback `black`), ensure clone is ordered after original for drawing — M — depends on: collection
- [ ] Second pass: for every path item that has a non-null stroke, set `strokeWidth` to `21` — S — depends on: clones styled
- [ ] `project.exportSVG({ asString: true })` (or equivalent) and write output file — S — depends on: width pass

### Phase 3 — CLI, errors, documentation

- [ ] Parse argv: required input path, optional output path (default derived from input basename, e.g. `*-out.svg` or documented pattern) — S
- [ ] Validate input exists and is readable; validate at least one filled path was processed — if zero matches, exit non-zero with stderr message — S — depends on: core
- [ ] Document in `README.md`: purpose, `cd tests/mixedIcon && npm install && node process.mjs <in> [out]`, v1 limitations (paths only, no CSS-only fills, round-trip) — S — [deferrable] polish: add example `imgs/*.svg` once you have a fixture

---

## Risk flags & open technical questions

- **Native `canvas` build:** `canvas` requires compile tooling on some platforms; if install fails, document OS prerequisites or fallback (e.g. Docker / pinned Node + prebuilds).
- **importSVG fidelity:** Groups, clips, masks, and non-`<path>` shapes may flatten or drop; scope stays “path-like items Paper exposes” — widen only if needed.
- **Fill detection edge cases:** `fill="none"`, transparent fills, and gradient fills — define behavior (skip duplication for none/transparent; for gradients, either stroke with flat fallback `black` or skip — document chosen rule in code comment).

---

## Out of scope

Same as PRD: no integration with main server/CLI; no non-`<path>` duplication rule in v1; no full SVG/CSS spec; no CI/visual regression unless added later.
