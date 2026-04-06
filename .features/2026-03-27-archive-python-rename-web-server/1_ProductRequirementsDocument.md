# PRD: Filled-icon detection and variable-template conversion

**Status:** Draft (sign-off pending — edit freely)  
**Date:** 2026-03-28

---

## Problem statement

The conversion pipeline is built around stroked SVG icons (outline, stroke-width, then stroke-to-fill). Icons that are already filled outlines (no meaningful stroke-based artwork) are not the right input for that path and need a different treatment. Users still expect a single upload and Convert action that produces an SF Symbol–style SVG they can download, without manually choosing a workflow.

---

## Goals & success criteria

- After upload, the server classifies the SVG as stroked-input or filled-input using a single documented rule; classification matches manual spot-checks on a small agreed fixture set (stroked-only SVG, fill-only SVG, stroke-only with fill none).
- When classified as stroked-input, behavior and output naming stay as they are today: existing multi-phase pipeline through the square template, download as today.
- When classified as filled-input, the server produces a new SVG document based on a read-only copy of `resources/square_variable_template.svg`, places the same prepared artwork into `Ultralight-S`, `Regular-S`, and `Black-S`, centers it within each slot’s preview frame, removes the `SFSymbolsPreviewWireframe` paths from those groups, and never writes to the template file on disk.
- Prepared artwork for the filled-input branch is normalized so its graphical extent fits a 112×112 user-unit square (consistent with Small scale in the existing pipeline documentation), then positioned with translate-only placement per slot (no scaling inside the template beyond that normalization step).
- Download delivery matches the current flow: HTTP response with SVG body and Content-Disposition attachment; filled-input filename is `{sanitizedStem}-SFSymbol.svg` where `sanitizedStem` follows the same safe stem rules as the server uses for uploads today (characters, length cap).
- Mixed geometry (same file treated as both stroke-driven and fill-driven icon work) is explicitly not handled; such files may follow whichever rule fires first or produce a generic error, but no separate “mixed” product behavior is in scope.

---

## User stories

- As a designer with a stroked icon SVG, I want to click Convert and get the same SF Symbol template output as today, so that my workflow does not change.
- As a designer with a filled-outline icon SVG (no stroke-based artwork), I want to click Convert and get a downloadable SF Symbol variable template SVG with my icon in Ultralight-S, Regular-S, and Black-S, so that I can use Xcode 26+ variable symbol workflows without hand-placing three copies.
- As a user, I want the app to pick stroked vs filled handling automatically from the file, so that I do not toggle modes or read internal pipeline names.
- As an operator, I want the master `square_variable_template.svg` on disk to stay unchanged after conversions, so that the repo template remains the source of truth.
- As a user who hits an invalid or empty upload, I want a clear error response consistent with today’s API (status code and message), so that I can fix the file and retry.

---

## Out of scope / non-goals

- Defining or implementing a dedicated “mixed geometry” workflow (both stroke-driven and fill-driven semantics in one icon); a future project may address that.
- Populating weights or scales beyond the three groups present in `square_variable_template.svg` (the file only defines Ultralight-S, Regular-S, Black-S).
- Changing stroked-output filename from the current `{stem}_SFSymbol.svg` pattern (hyphen naming applies to the filled-input branch as specified).
- UI beyond the existing Convert flow (no new buttons for this feature).
- Client-side-only conversion; logic remains on the server.
- Editing Notes, Guides, or descriptive text nodes in the template except where required for valid SVG output (default: preserve template structure and non-Symbol content as-is).

---

## Constraints & risks

- Detection is heuristic: stroke hidden by `display:none`, inherited styles, or use of `<use>` may misclassify; document the rule in implementation and tests.
- `square_variable_template.svg` contains a DOCTYPE; parsing must follow the same hardening approach as existing SVG I/O (e.g. strip DOCTYPE before parse).
- Variable template coordinate system is the Apple 3300×2200 artboard; centering must use the same slot transforms and wireframe geometry as in the template file.
- Filled-input branch duplicates identical artwork into three slots (no per-weight stroke width changes), which matches the variable template’s limited symbol set.
- Large files remain subject to existing upload size limits.

---

## Open questions

- Whether to add an optional environment variable for the variable template path (parallel to `SFSYMBOL_TEMPLATE_PATH`) for CI or alternate templates, or keep a single fixed default path under `resources/`.
- Exact detection pseudo-code for “meaningful stroke” (e.g. treat `stroke="none"` or zero width as non-stroked; whether `<line>` / `<polyline>` without fill always count as stroked).

---

## Refinement notes (from ideation pass)

- Mixed geometry is out of scope; misclassification or generic error there is acceptable.
- Filled branch uses `{sanitizedStem}-SFSymbol.svg`; stroked branch keeps existing `{stem}_SFSymbol.svg`.
- “112px” = 112×112 user units for prepared artwork; translate-only placement in template after normalization.
