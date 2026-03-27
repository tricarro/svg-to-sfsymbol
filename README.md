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
| [`resources/`](resources/) | SF Symbol square template (`square_template.svg`) required for phase 5 |
| [`.archive/python-legacy/`](.archive/python-legacy/) | Archived Python package and pytest suite (not used for day-to-day work) |

---

## Overview

**Input:** One SVG whose icon is drawn with **strokes** (not only fills)—typical for icons exported from design tools.

**Output:** One SVG that follows Apple’s **square SF Symbol template** layout: multiple size and weight variants merged into the correct groups, ready for preview and further editing in SF Symbols or related tooling.

**Why it exists:** Building SF Symbol sets by hand (every weight × size, stroke-to-fill, template placement) is slow and error-prone. This tool automates the mechanical steps so you can focus on the icon design.

---

## How to use (web UI)

1. **Install and run the stack** (see [Local development](#local-development) below): **server** on port `3000` (default for the Vite proxy) and the **web** dev server (usually port `5173`).
2. **Open the app** in a browser at the URL Vite prints (e.g. `http://localhost:5173`).
3. **Choose file** and pick a **stroked** `.svg`.
4. Click **Convert**. When processing finishes, the **SF Symbol template SVG** download should start automatically.
5. If something fails, check the on-screen error message—common issues include non-stroked-only artwork, invalid SVG, or a missing template file (see [Template file](#template-file)).

**Input tips**

- Prefer **simple stroked paths**; heavy effects or exotic SVG features may not convert cleanly.
- The pipeline expects stroke-based geometry it can outline and merge; filled-only icons are a different problem.

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

Phase 5 needs Apple’s **square SF Symbol template** SVG.

- **Default:** place `resources/square_template.svg` at the **repository root** (alongside `web/` and `server/`). The server resolves it automatically.
- **Override:** point to any file with:

  ```bash
  export SFSYMBOL_TEMPLATE_PATH=/path/to/square_template.svg
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
| **Programmatic use** | Import `runFullConvert` from [`server/src/pipeline.ts`](server/src/pipeline.ts) (after `npm run build`, use `server/dist/pipeline.js`); no separate CLI |

**Resources:** `resources/square_template.svg` is required for phase 5. Some tests use `resources/calendar-today.svg` when present; without it, those tests may skip.

**Legacy Python:** For comparison or historical context, see `.archive/python-legacy/` (FastAPI, `defusedxml`, `svg.path`, Shapely).

---

## License / contributions

Work in progress; see the repository for license and contribution expectations once they are finalized.
