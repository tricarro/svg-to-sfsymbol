# Implementation plan: Filled-icon detection and variable-template conversion

**Status:** Approved (implemented 2026-03-28)  
**PRD:** `.cursor/features/current/1_ProductRequirementsDocument.md`  
**Date:** 2026-03-28

---

## Overview

Extend the existing `POST /api/convert` flow so the server parses each upload once, classifies it as stroked-input or filled-input, then either runs today’s `runFullConvert` + square template path or builds a new SVG by cloning `resources/square_variable_template.svg` in memory, normalizing artwork to a 112×112 user-unit frame, and filling `Ultralight-S`, `Regular-S`, and `Black-S` using translate-only centering and wireframe removal—mirroring the mechanics of `phase5.fillSlot` without writing the template file to disk. Stroked outputs keep `{stem}_SFSymbol.svg`; filled outputs use `{stem}-SFSymbol.svg`. No web UI changes beyond what already follows `Content-Disposition`.

---

## Architecture decisions

### Single endpoint, server-side branch

Keep one multipart handler in `app.ts` that calls a small orchestrator (e.g. `convertSync` refactored or a wrapper) so the client stays unchanged. Classification and branch-specific errors stay on the server.

### Detection rule (v1)

Define `classifySvgStrokedOrFilled(svgXml: string): "stroked" | "filled"` on the parsed DOM (use existing `parseSvgXml`). **Stroked** if any graphical element in a documented tag set (`path`, `line`, `polyline`, `polygon`, `rect`, `circle`, `ellipse`, and optionally `text`) has a “visible” stroke: `stroke` absent or not `none`/`transparent`, and effective `stroke-width` (presentation attribute or simple inline `style` parse for `stroke` / `stroke-width` only) is not `0`. Treat `<line>` and `<polyline>` / `<polygon>` as stroked when they have no fill paint **or** any stroke paint per the same rules (default stroke is visible). **Filled** otherwise. Skip `defs` subtree for this scan. Document limitations (`<use>`, inherited CSS, `display:none`) in code comments; no mixed-mode product behavior per PRD.

### Variable template path

Default: `resources/square_variable_template.svg` resolved from repo root (same pattern as `defaultSquareTemplatePath` in `phase5.ts`). Optional env override `SFSYMBOL_VARIABLE_TEMPLATE_PATH` (mirror `SFSYMBOL_TEMPLATE_PATH` behavior: expand user, resolve, exist check) so CI can point at a fixture without copying files.

### Normalization before slot placement

Prepared artwork must occupy a **112×112** user-unit square aligned with phase 1 Small (`PHASE1_VARIANTS` `sidePx: 112`). **v1:** Derive scale from the root `viewBox` (or width/height fallback per `readViewBox` semantics): uniform scale so the viewBox rectangle fits inside `[0, 112] × [0, 112]`, then translate so the scaled content is centered in that box; wrap in an inner `<g>` under a logical icon root with `viewBox="0 0 112 112"`. **Slot placement:** Reuse the same translate-only centering approach as `phase5`: wireframe path `d` → bbox in slot local coords; icon center at `(56, 56)` in the 112×112 frame; `translate(tx ty)` on a wrapper `<g>` inside each slot. Remove each slot’s `SFSymbolsPreviewWireframe` path after insertion.

### Code reuse vs new module

Extract or duplicate the minimal helpers needed for variable slots (`pathBBoxFromD` / wireframe discovery / defs merge pattern) to avoid `runPhase5`’s “one file per slot” filesystem contract. Prefer **new module** `server/src/variableTemplateFilled.ts` (name adjustable) that imports shared pieces from `xml.ts` and optionally **exports** shared bbox/wireframe helpers from `phase5.ts` if refactor is small; otherwise duplicate `pathBBoxFromD` privately with a comment to dedupe later—**decision in implementation:** extract `pathBBoxFromD` + `classHasWireframe` to `phase5Shared.ts` or `templateSlots.ts` only if it stays under ~30 lines moved; else duplicate for speed.

### Serialization

Never write to `square_variable_template.svg`. Read template bytes from disk once per request, `parseSvgXml`, mutate the in-memory document, return `elementToBytes(svgRoot)` (same as phase 5 output path). Optional: strip or retain generator DOCTYPE in output—prefer **omit DOCTYPE** in serialized output for consistency with hardened parse path (already strips on input).

---

## File & folder changes

| Action | Path | Notes |
|--------|------|-------|
| Create | `server/src/svgStrokeDetection.ts` | `classifySvgStrokedOrFilled` + unit tests co-located or in `svgStrokeDetection.test.ts` |
| Create | `server/src/variableTemplateFilled.ts` | `mergeFilledIconIntoVariableTemplate(svgXml: string, options?: { templatePath?: string }) => Buffer` |
| Create | `server/src/variableTemplateFilled.test.ts` | Fixtures: minimal stroked SVG, minimal filled SVG, assert three slots lack wireframe and contain imported nodes |
| Modify | `server/src/app.ts` | Resolve variable template path; branch after classification; map new errors to 503 if template missing |
| Modify | `server/src/phase5.ts` | Optional: export small helpers for bbox/wireframe to share with variable template (if refactor chosen) |
| Create | `server/resources` or use repo `resources/` | Tests may use strings inlined; optional tiny fixtures under `server/src/__fixtures__/` |

---

## Component & interface design

```ts
// svgStrokeDetection.ts
export function classifySvgStrokedOrFilled(xml: string): "stroked" | "filled";
```

```ts
// variableTemplateFilled.ts
export function defaultVariableTemplatePath(): string | null;
export function mergeFilledIconIntoVariableTemplate(
  iconSvgXml: string,
  opts?: { templatePath?: string }
): Buffer;
```

```ts
// app.ts (conceptual)
export function convertSync(svgBytes: Buffer, originalFilename: string): { data: Buffer; downloadName: string };
// Internally: parse → classify → stroked: existing body; filled: mergeFilledIconIntoVariableTemplate(utf8, { templatePath })
```

---

## API & data model

- **Endpoint:** `POST /api/convert` unchanged.
- **Success:** `Content-Type: image/svg+xml`; `Content-Disposition: attachment; filename="..."` with `filename="${stem}_SFSymbol.svg"` (stroked) or `filename="${stem}-SFSymbol.svg"` (filled).
- **Errors:** Reuse existing status mapping; add 503 when variable template missing (message analogous to square template). Invalid SVG continues to surface as 400/500 with `detail` string.

---

## Phased task sequence

### Phase 1 — Detection and tests

- [ ] Implement `classifySvgStrokedOrFilled` using `parseSvgXml` and documented traversal rules — M
- [ ] Add Vitest cases: stroke-only path; fill-only path; `line` element; `stroke="none"`; `stroke-width="0"` — S

### Phase 2 — Variable template merge core

- [ ] Implement `defaultVariableTemplatePath` + env `SFSYMBOL_VARIABLE_TEMPLATE_PATH` resolver (parallel to square template UX) — S
- [ ] Implement 112×112 normalization wrapper from parsed icon root (viewBox-based scale + center) — M — depends on: classification contract stable
- [ ] Implement merge into three fixed slot ids `Ultralight-S`, `Regular-S`, `Black-S`: locate `Symbols`, find each `<g id="…">`, remove wireframe `path`, append wrapper `<g transform="translate(...)">` with imported visual children; merge `defs` into template `defs` with id deduping like `mergeIconDefsInto` — M — depends on: normalization
- [ ] Serialize merged document to `Buffer` without writing source template — S

### Phase 3 — HTTP integration and fixtures

- [ ] Refactor `convertSync` to branch on classification; filled path skips `runFullConvert` and square template resolution — S — depends on: Phase 2
- [ ] Extend `app.ts` error handling for missing variable template (503) — S
- [ ] Add integration-style test: full buffer through `mergeFilledIconIntoVariableTemplate` or `convertSync` with filled fixture — M

### Phase 4 — Docs and polish

- [ ] Update root `README.md` with one short subsection: auto branch, filled output naming, env var for variable template — S
- [ ] Add inline module doc for detection limitations (`<use>`, complex CSS) — S — [deferrable]

**Complexity key:** S = under an hour / M = half day / L = full day or more

---

## Risk flags & open technical questions

- **BBox vs viewBox:** v1 normalization uses viewBox (and `readViewBox` fallback), not true geometric bounds—very asymmetric viewBoxes may leave excess whitespace or clip in slots; acceptable for v1 per PRD; revisit if user files fail.
- **xmldom serialization:** Ensure imported nodes and namespaces produce valid SVG for Xcode; validate with one manual round-trip in SF Symbols / Xcode 26+ during QA.
- **Template drift:** Apple updates `square_variable_template.svg`; slot ids or wireframe class must match—add test that fails if `Symbols` children missing expected ids.

---

## Out of scope

Per PRD: mixed-geometry workflow, additional weights/scales beyond the three groups, UI for manual mode, client-side conversion, changing stroked download filename pattern.
