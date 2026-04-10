# PRD: Mixed-icon Paper.js terminal test (`tests/mixedIcon`)

**Status:** Approved  
**Date:** 2026-04-09  

---

## Problem statement

The repo’s main conversion pipeline is separate from this work. You need a small, repeatable way to experiment with SVG icons that mix strokes and fills: specifically, duplicate every filled `<path>`, strip fill from the copies, draw strokes on those copies, normalize stroke width, and keep both originals and copies visible in one output SVG—run from the terminal via a Node script using Paper.js.

---

## Goals & success criteria

- A Node script under `tests/mixedIcon` runs from the project root (or documented cwd) with no manual steps beyond the documented command (e.g. input path, optional output path).
- Given an input SVG, the script identifies all `<path>` elements that have a fill (fill present and not `none`; treat `currentColor` as a fill for duplication purposes).
- For each such path, the output contains the original path unchanged and an additional duplicated `<path>` that: has no fill (or `fill="none"`), has a visible stroke, and is geometrically a copy of the original path data.
- After processing, every `<path>` in the output that has a `stroke` (including pre-existing stroked paths and the new duplicate outlines) uses a stroke width of exactly `21` in user units, expressed in a way that survives round-trip (e.g. `stroke-width="21"` or equivalent Paper export), unless an open question defers this.
- The script writes a single output SVG file; opening it in a typical viewer shows both filled originals and stroked duplicates (layering: duplicates are drawn after their originals so outlines appear on top unless implementation constraints dictate otherwise—document the actual order in implementation notes).
- Failure modes are explicit: missing input file, unreadable SVG, or zero qualifying paths yields a clear exit code and stderr message (no silent empty success).

---

## User stories

- As a developer running experiments, I want to run one terminal command against an SVG file, so that I get a transformed SVG without opening a browser.
- As a developer, I want every `<path>` that has a fill to gain a stroked twin, so that I can compare fill and stroke-only geometry side by side in one file.
- As a developer, I want the original filled paths to remain as they were (including their fills), so that the baseline artwork is preserved.
- As a developer, I want duplicate paths to have fills removed and strokes applied, so that the copy reads as outline-only relative to the original.
- As a developer, I want stroke widths normalized to 21px (user units), so that weight is consistent across stroked elements in the test output.
- As a developer, I want this isolated under `tests/mixedIcon` with its own minimal `package.json`/deps if needed, so that it does not entangle the main app’s build or runtime.
- As a developer, I want clear errors when the input is invalid or empty of qualifying paths, so that I can fix assets or assumptions quickly.

---

## Out of scope / non-goals

- Integrating this flow into the main svg-to-sfsymbol server, CLI, or production conversion path.
- Supporting arbitrary SVG elements beyond `<path>` for the duplication rule (e.g. `<circle>`, `<rect>`, `<use>`, text), unless explicitly added later.
- Full SVG spec compliance for every attribute, filter, mask, clip-path, or CSS stylesheet indirection; initial version may document supported subset (e.g. inline attributes on paths only).
- Pixel-perfect visual matching to a specific design tool beyond “both layers visible and stroke width 21 on stroked paths.”
- Automated visual regression tests or CI wiring (optional follow-up).

---

## Constraints & risks

- Paper.js in Node typically requires a headless DOM/canvas setup (e.g. `canvas` + `paper-jsdom` or project-documented equivalent). Bundle size and native addons (`canvas`) are acceptable for a dev-only test folder but should be pinned in a local lockfile.
- Round-trip through Paper may alter path serialization, transforms, or attributes; risk of subtle geometry or attribute loss must be accepted for this experiment or mitigated with a documented baseline SVG.
- “Filled path” detection must be defined (presentation attributes vs. inherited style). If only inline `fill` is supported initially, state that in implementation.
- Global `stroke-width: 21` on all stroked `<path>` elements may change existing artwork that already had strokes; this matches the stated “change all stroke widths to 21px” intent but should be confirmed against open questions.

---

## Open questions

- Stroke appearance on duplicates: should stroke color default to the path’s former fill color, a fixed color (e.g. black), or copy an existing `stroke` if present? If unset before implementation, default to: stroke color equals previous fill color (or `black` when fill is `currentColor` and cannot be resolved).
- Should `stroke-width` 21 apply to every stroked `<path>` in the document after export, or only to the newly created duplicate paths (leaving original stroked paths’ widths unchanged)?
