# SVG to SF Symbol Converter

Turn **stroked SVG icons** into a single **merged SF Symbol template SVG**—the kind of file you can drop into Apple’s symbol workflows instead of hand-building every weight and size.

The project includes a **small web app** (upload → convert → download) and **two equivalent backends** that run the same multi-phase pipeline:

- **Node.js** (Fastify, under [`api/`](api/)) — default target for the Vite dev proxy.
- **Python** (FastAPI, under [`src/svg_to_sfsymbol/`](src/svg_to_sfsymbol/)) — original implementation; kept for reference, CLI, and `pytest`.

> **Status:** Under active development; behavior and APIs may still change.

---

## Overview

**Input:** One SVG whose icon is drawn with **strokes** (not only fills)—typical for icons exported from design tools.

**Output:** One SVG that follows Apple’s **square SF Symbol template** layout: multiple size and weight variants merged into the correct groups, ready for preview and further editing in SF Symbols or related tooling.

**Why it exists:** Building SF Symbol sets by hand (every weight × size, stroke-to-fill, template placement) is slow and error-prone. This tool automates the mechanical steps so you can focus on the icon design.

---

## How to use (web UI)

1. **Install and run the stack** (see [Local development](#local-development) below): **Node** API on port `3000` (default for the frontend proxy) *or* **Python** on port `8000` (change the Vite proxy if you use Python), plus the Vite dev server (usually port `5173`).
2. **Open the app** in a browser at the URL Vite prints (e.g. `http://localhost:5173`).
3. **Choose file** and pick a **stroked** `.svg`.
4. Click **Convert**. When processing finishes, the **SF Symbol template SVG** download should start automatically.
5. If something fails, check the on-screen error message—common issues include non-stroked-only artwork, invalid SVG, or a missing template file (see [Template file](#template-file)).

**Input tips**

- Prefer **simple stroked paths**; heavy effects or exotic SVG features may not convert cleanly.
- The pipeline expects stroke-based geometry it can outline and merge; filled-only icons are a different problem.

---

## Local development

### Backend — Node.js (default for the UI)

Requires **Node.js v20.15.1** (see [`.nvmrc`](.nvmrc) at the repo root). From the repository root:

```bash
cd api
npm install
npm run dev
```

This runs the API on **`http://127.0.0.1:3000`** with live reload (`tsx`). For a production-style Node run:

```bash
cd api
npm install
npm run build
npm start
```

**Tests (Node):**

```bash
cd api && npm test
```

### Backend — Python (FastAPI + uvicorn)

```bash
pip install -e ".[web]"
uvicorn svg_to_sfsymbol.web_api:app --reload --host 127.0.0.1 --port 8000
```

### Frontend (Vite)

In another terminal:

```bash
cd frontend && npm install && npm run dev
```

[`frontend/vite.config.ts`](frontend/vite.config.ts) proxies `/api` to **`http://127.0.0.1:3000`** (Node). To use Python during dev instead, change the proxy `target` to `http://127.0.0.1:8000`.

---

## Production-style run

**Option A — Node:** build the frontend, then start the Node server. If `frontend/dist` exists, the Node app can serve the built UI at `/` and **`POST /api/convert`** for uploads.

```bash
cd frontend && npm run build
cd ../api && npm install && npm run build && npm start
```

Open `http://127.0.0.1:3000` (or set `PORT` / `HOST` as needed).

**Option B — Python:** build the frontend, then start uvicorn. If `frontend/dist` exists, the API **serves the built UI at `/`** and keeps **`POST /api/convert`** for uploads.

```bash
cd frontend && npm run build
cd .. && uvicorn svg_to_sfsymbol.web_api:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000` in the browser.

---

## Template file

Phase 5 needs Apple’s **square SF Symbol template** SVG.

- **Default:** place `resources/square_template.svg` at the **repository root** (alongside `src/` and `api/`). Both Node and Python pick it up automatically.
- **Override:** point to any file with:

  ```bash
  export SFSYMBOL_TEMPLATE_PATH=/path/to/square_template.svg
  ```

---

## How it works (pipeline)

Processing runs in **phases**, each using the previous output. The same steps are implemented in Python and in Node (`api/src/`).

1. **Phase 1 — Size variants**  
   Produces square canvases at **large (164×164)**, **medium (136×136)**, and **small (112×112)** user units. Geometry is scaled with **baked coordinates** (affines applied to paths and basic shapes) so stroke widths are not blown up by a parent `scale()`.

2. **Phase 2 — Weight slots**  
   Duplicates each size into nine **weight-named** files (e.g. `Regular-M.svg`, `Black-L.svg`) in SF Symbol weight order, then removes the intermediate `large` / `medium` / `small` filenames. The original upload is kept separately.

3. **Phase 3 — Path weights**  
   Assigns **stroke-width** per weight and scale (L / M / S) from a fixed table aligned with SF Symbol path-weight references.

4. **Phase 4 — Stroke to fill**  
   Expands stroked paths into **filled outlines** (polygonal approximation via sampling, then planar buffering). **Python** uses **Shapely**; **Node** uses **JSTS**. Strokes are stripped where converted. A merge pass for sibling paths is **disabled** in both implementations (same as current Python behavior).

5. **Phase 5 — SF Symbol template**  
   Merges the weight×size SVGs into the **square template**. Each symbol is placed in the matching `<g id="…">` under `<g id="Symbols">`, **centered with translate only** (no scaling) on the slot’s preview wireframe box, then the **wireframe path** is removed. Guides and template structure stay intact for symbol workflows.

---

## Implementation notes

| | **Python** (`src/svg_to_sfsymbol/`) | **Node** (`api/`) |
|---|-------------------------------------|-------------------|
| **HTTP** | FastAPI, `web_api.py` | Fastify, `app.ts` / `server.ts` |
| **XML** | `defusedxml` | `@xmldom/xmldom` + DOCTYPE stripped before parse |
| **Paths** | `svg.path` | `svgpath` |
| **Stroke → fill** | Shapely (GEOS) | JSTS |
| **Tests** | `pytest` (`tests/`) | Vitest (`cd api && npm test`) |
| **CLI** | `svg-sfsymbol-phase1` and full convert via `__main__.py` | No bundled CLI yet; use `npm test`, HTTP, or import `runFullConvert` from `pipeline.ts` |

- **Resources:** `resources/square_template.svg` is required for phase 5. Some tests expect `resources/calendar-today.svg`; without it, those tests may be skipped or fail until you add the file.

## License / contributions

Work in progress; see the repository for license and contribution expectations once they are finalized.
