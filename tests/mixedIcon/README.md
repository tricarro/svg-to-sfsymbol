# Mixed-icon Paper.js terminal test

Isolated experiment in four stages:

1. **Import** with `expandShapes: true` so primitives (rect, circle, …) become paths where Paper supports it.
2. **Duplicate** each filled path-like item (`Path` / `CompoundPath`), clear fill on the copy, stroke it with the original fill color (black for gradients / unresolved cases), insert the copy above the original.
3. **Normalize** every stroked path’s width to **21** user units.
4. **Outline strokes** (default): post-process the exported SVG with **Maker.js** (`expandPaths`) so stroked geometry becomes **filled** paths. Outlined paths are **aligned** to the original stroke centerline using Paper bounds (Maker’s `toSVGPathData` alone drops absolute position for some contours).

```bash
node process.mjs [--no-outline] <input.svg> [output.svg]
```

- Omitting the output path writes `basename-out.svg` next to the input.
- **`--no-outline`** skips stage 4 (useful to compare Paper-only export vs fully filled output).

## Setup

```bash
cd tests/mixedIcon
npm install
```

Uses `canvas` (native prebuilds where available) and `jsdom` so Paper’s `importSVG` has a `DOMParser`. `.npmrc` sets `legacy-peer-deps=true` because `jsdom@25` lists an optional peer on `canvas@2` while this package uses `canvas@3`.

## Run

```bash
node process.mjs imgs/sample.svg
# writes imgs/sample-out.svg

node process.mjs imgs/sample.svg path/to/custom-out.svg

node process.mjs --no-outline imgs/sample.svg imgs/paper-only.svg
```

## v1 limitations

- Only items Paper imports as `Path` / `CompoundPath` participate in the duplicate step. Other SVG tags are not duplicated.
- Fills applied only via CSS (no inline `fill`) are invisible to the duplicate step.
- **Outline step:** `stroke` values must be a solid paint (not `url(#…)` gradients/patterns). **`stroke-dasharray`** is skipped (warning once). Elements with a **`transform`** skip center alignment (outlined path may be offset).
- **Thick strokes on very small closed paths** (e.g. tiny dots with width 21) can produce degenerate outlines; Maker.js may throw (`valueIds` / combine internals). Those paths are **left stroked** and a warning is printed — inspect or simplify the source icon.
- Round-trip through Paper may change path data, transforms, or attributes.
- macOS: if `canvas` fails to install, install build prerequisites from [node-canvas](https://github.com/Automattic/node-canvas) or use a Node version/OS combo with prebuilt binaries.
