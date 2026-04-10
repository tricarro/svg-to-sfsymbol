# Implementation summary: Mixed-icon Paper.js terminal test

## What shipped

- **Phase 1 — Toolchain:** `tests/mixedIcon/package.json` with `paper`, `canvas@^3`, `jsdom@^25`, ESM (`"type": "module"`), `npm start` → `node process.mjs`. Lockfile from `npm install`.
- **Phase 2 — Core:** `process.mjs` reads SVG, `paper.setup` + `project.importSVG`, finds filled top-level `Path` / `CompoundPath` items, clones with `insertAbove` original, clears fill on clone, sets stroke from fill (black for gradients / edge cases), then sets `strokeWidth` to `21` on every path-like item that has a stroke; exports with `bounds: 'content'` and `asString: true`.
- **Phase 3 — CLI & docs:** argv `[input] [optional output]`, default `basename-out.svg` next to input; missing file / read-import-export-write failures and **zero** qualifying paths exit `1` with stderr; `README.md` covers setup, run, limitations; `imgs/sample.svg` fixture.

## Files touched

| Path | Action |
|------|--------|
| `tests/mixedIcon/package.json` | Created |
| `tests/mixedIcon/package-lock.json` | Created (`npm install`) |
| `tests/mixedIcon/.npmrc` | Created (`legacy-peer-deps=true`) |
| `tests/mixedIcon/.gitignore` | Created (`node_modules/`, `*-out.svg`) |
| `tests/mixedIcon/process.mjs` | Created |
| `tests/mixedIcon/README.md` | Created |
| `tests/mixedIcon/imgs/sample.svg` | Created |

## Commands run

- `cd tests/mixedIcon && npm install` (after adding `jsdom` and pinning `canvas@^3` with `.npmrc` legacy peer deps).
- `node process.mjs imgs/sample.svg` — succeeded; wrote `sample-out.svg` (removed before finish; pattern gitignored).
- `node process.mjs` with SVG containing only `fill="none"` path — exited `1` with expected stderr.

## Deviations from plan

- **`jsdom` added** — Paper’s `importSVG` requires `self.DOMParser`; without `jsdom`, string import throws. Not listed as a direct dependency in the plan but required in practice.
- **`canvas@3` + `legacy-peer-deps`** — Plan suggested `canvas` + Paper; `jsdom@25` peer-optional `canvas@2` conflicted with `canvas@3` (which has usable prebuilds on this darwin/arm64 Node 20 host). Resolved with `.npmrc` `legacy-peer-deps=true` and `canvas@^3.1.0`. Attempted `canvas@2` + `jsdom@24` failed native compile (`pkg-config` / prebuild 404).
- **`.gitignore` for `*-out.svg`** — Keeps generated SVGs out of version control; plan deferrable “example output” left as on-demand via script.

## Notes for QA / review

- **Layer order:** Duplicates use `insertAbove(original)` so clones render after (on top of) originals.
- **Stroke width:** All path-like items with a non-null `strokeColor` after edits get `strokeWidth === 21` (including originals that already had strokes).
- **Paper import noise:** Export may add `clipPath`, default `stroke-width="1"` on some nodes, and normalize path syntax vs source.
- **Environment:** Re-run `npm install` on a clean clone; if `canvas` fails, follow node-canvas OS deps. README documents this.
