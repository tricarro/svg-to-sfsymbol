# build-pipeline

Self-contained duplicate of the SVG → SF Symbol conversion logic that still lives under [`server/src`](../server/src). The Fastify app continues to use `server/src` unchanged; this package exists for clearer module names, future Momentum-style builder integration, and extraction without pulling in HTTP code.

## Layout

- `src/steps/` — size variants, weight replicas, stroke widths, stroke-to-outline (JSTS), square template merge
- `src/svg/` — XML I/O and affine bake
- `src/routing/` — stroke/fill classification for routing
- `src/preprocess/` — mixed-icon → stroked SVG
- `src/filled/` — variable template merge and mixed → fill-only helper
- `resources/` — copies of `square_template.svg` and `square_variable_template.svg` (and optional fixtures) so tests and defaults do not read outside this package

## Drift warning

There are two TypeScript trees until the server is rewired: edits to conversion behavior should be applied to both, or you will get divergent behavior. The same applies to template SVGs under repo-root [`resources/`](../resources/) versus `build-pipeline/resources/`.

## Usage

From the repo root (with workspaces installed):

```bash
cd build-pipeline && npm install && npm run build && npm test
```

Programmatic import after `npm run build`:

```js
import { runFullConvert } from "build-pipeline";
```

Option names differ from `server/src/pipeline.ts`: e.g. `sizeVariantsOnly`, `skipStrokeWidths`, `squareTemplatePath`, `mergedSvgOutputPath`, `missingSlotPolicy`, `outlineFlatness`. See `src/runFullConvert.ts`.

## Node

Align with the server: Node 20+ recommended.
