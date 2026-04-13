# SVG to SF Symbol Converter

Turn **stroked SVG icons** into a single **merged SF Symbol template SVG**—the kind of file you can drop into Apple’s symbol workflows instead of hand-building every weight and size.

The project is a **small web app** (upload → convert → download) backed by a **Node.js** server (Fastify) that runs the conversion pipeline. The **original Python** implementation is kept for reference under [`.archive/python-legacy/`](.archive/python-legacy/).

> **Status:** Under active development; behavior and APIs may still change.

---

## Repository layout

| Path | Role |
|------|------|
| [`web/`](web/) | Vite + TypeScript browser UI |
| [`server/`](server/) | Fastify API, SVG pipeline (`server/src/`), Vitest tests |
| [`build-pipeline/`](build-pipeline/) | Duplicate, self-contained pipeline package (descriptive step names; no Fastify). Templates under `build-pipeline/resources/`. See [`build-pipeline/README.md`](build-pipeline/README.md). |
| [`resources/`](resources/) | SF Symbol templates: `square_template.svg` (stroked path, phase 5) and `square_variable_template.svg` (filled path, three S slots) |
| [`.archive/python-legacy/`](.archive/python-legacy/) | Archived Python package and pytest suite (not used for day-to-day work) |

Root [`package.json`](package.json) defines npm workspaces (`server`, `build-pipeline`). Run **`npm test`** from the repository root to execute Vitest in both packages.

---

## Overview

**Input:** One SVG icon. The server **detects** whether the artwork uses a **visible stroke** (presentation attributes or simple inline `style`) on paths, basic shapes, or text. **Stroke-only** and **mixed** (stroke + fill on the same file) inputs go through the full pipeline into the **square** template; mixed icons are preprocessed so **fill regions become stroked boundaries** (width/color derived from existing strokes) before phase 1. **Fill-only** inputs are scaled to a 112×112 frame and merged into Apple’s **variable** square template (`Ultralight-S`, `Regular-S`, `Black-S` only).

**Output:** Either the full **square** SF Symbol template (stroked path, including preprocessed mixed icons) or the **variable** template SVG (filled path), as a download.

**Why it exists:** Building SF Symbol sets by hand (every weight × size, stroke-to-fill, template placement) is slow and error-prone. This tool automates the mechanical steps so you can focus on the icon design.

---

## How to use (web UI)

1. **Install and run the stack** (see [Local development](#local-development) below): **server** on port `3000` (default for the Vite proxy) and the **web** dev server (usually port `5173`).
2. **Open the app** in a browser at the URL Vite prints (e.g. `http://localhost:5173`).
3. **Choose file** and pick a `.svg` (stroked or fill-only artwork).
4. Click **Convert**. When processing finishes, the **SF Symbol template SVG** download should start automatically. **Stroke-only and mixed** files download as `{name}_SFSymbol.svg`; **fill-only** files as `{name}-SFSymbol.svg` (variable template).
5. If something fails, check the on-screen error message—common issues include invalid SVG or a missing template file (see [Template file](#template-file)).

**Input tips**

- Prefer **simple** paths; heavy effects or exotic SVG features may not convert cleanly.
- **Detection** is heuristic (presentation attributes and basic inline `style` only); `<use>`, hidden strokes, or complex CSS may misclassify. **Mixed** stroke+fill icons use the square template after fill-to-stroke preprocessing (group transforms and inherited paint are still limited, same as other heuristics).
- The root `<svg>` needs a **`viewBox`** or numeric **`width`/`height`** (not percentages). Otherwise conversion responds with a clear validation error.

---

## Local development

Requires **Node.js v20.15.1** (see [`.nvmrc`](.nvmrc) at the repo root).

**Server** (from repository root):

```bash
cd server
npm install
npm run dev
```

Runs on **`http://127.0.0.1:3000`** with live reload (`tsx`). Production-style run:

```bash
cd server
npm install
npm run build
npm start
```

**Tests (server):**

```bash
cd server && npm test
```

**Tests (build-pipeline package):**

```bash
cd build-pipeline && npm test
```

From the **repository root** (after `npm install` once at root): `npm test` runs both workspaces.

**Web** (second terminal):

```bash
cd web && npm install && npm run dev
```

[`web/vite.config.ts`](web/vite.config.ts) proxies `/api` to **`http://127.0.0.1:3000`**.

---

## Production-style run

Build the web app, then start the server. If `web/dist` exists, the server serves the built UI at `/` and exposes **`POST /api/convert`** for uploads.

```bash
cd web && npm run build
cd ../server && npm install && npm run build && npm start
```

Open `http://127.0.0.1:3000` (or set `PORT` / `HOST` as needed).

---

## Template file

**Square template (stroked icons):** Phase 5 needs Apple’s **square SF Symbol template** SVG.

- **Default:** `resources/square_template.svg` at the **repository root**. The server resolves it automatically.
- **Override:**

  ```bash
  export SFSYMBOL_TEMPLATE_PATH=/path/to/square_template.svg
  ```

**Variable template (fill-only icons):** Merging uses `resources/square_variable_template.svg` by default (never modified on disk; output is a new file).

- **Override:**

  ```bash
  export SFSYMBOL_VARIABLE_TEMPLATE_PATH=/path/to/square_variable_template.svg
  ```

---

## How it works (pipeline)

Processing runs in **phases**, each using the previous output. Implementation lives in **`server/src/`** (TypeScript). The archived Python code in `.archive/python-legacy/` followed the same logical steps.

1. **Phase 1 — Size variants**  
   Produces square canvases at **large (164×164)**, **medium (136×136)**, and **small (112×112)** user units. Geometry is scaled with **baked coordinates** (affines applied to paths and basic shapes) so stroke widths are not blown up by a parent `scale()`.

2. **Phase 2 — Weight slots**  
   Duplicates each size into nine **weight-named** files (e.g. `Regular-M.svg`, `Black-L.svg`) in SF Symbol weight order, then removes the intermediate `large` / `medium` / `small` filenames. The original upload is kept separately.

3. **Phase 3 — Path weights**  
   Assigns **stroke-width** per weight and scale (L / M / S) from a fixed table aligned with SF Symbol path-weight references.

4. **Phase 4 — Stroke to fill**  
   Expands stroked paths into **filled outlines** (polygonal approximation via sampling, then planar buffering) using **JSTS**. Strokes are stripped where converted. A merge pass for sibling paths is **disabled** (same as the archived Python behavior).

5. **Phase 5 — SF Symbol template**  
   Merges the weight×size SVGs into the **square template**. Each symbol is placed in the matching `<g id="…">` under `<g id="Symbols">`, **centered with translate only** (no scaling) on the slot’s preview wireframe box, then the **wireframe path** is removed. Guides and template structure stay intact for symbol workflows.

---

## Implementation notes (Node server)

| Topic | Choice |
|-------|--------|
| **HTTP** | Fastify, `server/src/app.ts` / `server.ts` |
| **XML** | `@xmldom/xmldom` + DOCTYPE stripped before parse |
| **Paths** | `svgpath` |
| **Stroke → fill** | JSTS |
| **Tests** | Vitest (`cd server && npm test`) |
| **Programmatic use** | **Server (current app):** import `runFullConvert` from [`server/src/pipeline.ts`](server/src/pipeline.ts) (after `npm run build`, use `server/dist/pipeline.js`). **Standalone package:** import from [`build-pipeline`](build-pipeline/) after `cd build-pipeline && npm run build` — same overall flow, but option names use step vocabulary (`sizeVariantsOnly`, `skipStrokeWidths`, `squareTemplatePath`, `mergedSvgOutputPath`, etc.); see `build-pipeline/src/runFullConvert.ts`. No separate CLI. |
| **Upload routing** | `classifySvgRouting` in [`server/src/svgStrokeDetection.ts`](server/src/svgStrokeDetection.ts): **fill-only** → [`variableTemplateFilled.ts`](server/src/variableTemplateFilled.ts); **mixed** → [`mixedIconToStrokedSvg.ts`](server/src/mixedIconToStrokedSvg.ts) then square pipeline; **stroke-only** → square pipeline. [`mixedIconToFilled.ts`](server/src/mixedIconToFilled.ts) remains for tests / reuse (union-to-fill), not used for HTTP conversion. `classifySvgStrokedOrFilled` remains for stroke vs non-stroke checks. |

**Resources:** Stroked conversion needs `resources/square_template.svg`. Fill-only conversion needs `resources/square_variable_template.svg`. Some tests use `resources/calendar-today.svg` when present; without it, those tests may skip.

**Legacy Python:** For comparison or historical context, see `.archive/python-legacy/` (FastAPI, `defusedxml`, `svg.path`, Shapely).

---

## License / contributions

Work in progress; see the repository for license and contribution expectations once they are finalized.
