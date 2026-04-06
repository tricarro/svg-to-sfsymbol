# Implementation: HandlingStrokesAndFills

## What shipped

- **Three-way routing** (`classifySvgRouting`): `filled`, `stroked-only`, `mixed`, using visible stroke and visible fill heuristics (presentation + inline `style`, `defs` skipped), aligned with existing stroke detection.
- **Mixed path**: `mixedIconToFillOnlySvg` outlines stroked primitives with the same JSTS buffer rules as phase 4, builds fill geometry for path / polyline / polygon / rect / circle / ellipse, **unions** all pieces, emits a minimal black-filled SVG, then **`mergeFilledIconIntoVariableTemplate`** runs as for fill-only icons (`*-SFSymbol.svg`).
- **`phase4` exports**: `strokeElementToOutlineGeometry`, `fillElementToGeometry`, `unionJtsGeometries`, `jtsGeometryToSvgPathD`, plus internal refactor `outlineGeometryFromSubpaths` shared with stroke expansion.

## Files touched

| Path | Action |
|------|--------|
| `.cursor/features/current/2_Plan.md` | Created (plan) |
| `server/src/svgStrokeDetection.ts` | `elementHasVisibleFill`, `classifySvgRouting` |
| `server/src/svgStrokeDetection.test.ts` | Routing tests |
| `server/src/phase4.ts` | Fill geometry helpers, exports, outline refactor |
| `server/src/mixedIconToFilled.ts` | New |
| `server/src/mixedIconToFilled.test.ts` | New |
| `server/src/app.ts` | `convertSync` uses `classifySvgRouting` + mixed preprocessor |
| `README.md` | Upload routing row |

## Commands run

- `cd server && npm run build` — success
- `cd server && npm test` — 26 tests passed

## Deviations from plan

- None material; README update included for discoverability.

## Notes for QA / review

- **Dashed strokes** (`stroke-dasharray`): still skipped for outline conversion (same as phase 4); mixed icons with dashes may throw “no geometry” or partial results.
- **Donuts / even-odd holes**: multiple subpaths are unioned additively; holes that rely on even-odd without subtraction may be wrong.
- **Transforms** on child shapes are not baked; icons should be flattened or authored in user space like today’s fill path.
- API errors from `mixedIconToFillOnlySvg` surface as **500** unless mapped in `app.ts` (optional follow-up).
