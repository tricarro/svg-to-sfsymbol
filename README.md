# SVG to SF Symbol Converter

Turn **stroked SVG icons** into a single **merged SF Symbol template SVG**—the kind of file you can drop into Apple’s symbol workflows instead of hand-building every weight and size.

The project includes a **small web app** (upload → convert → download) backed by a **Python pipeline** that scales the artwork, applies SF Symbol–style weights, converts strokes to fills, and slots everything into Apple’s square template.

> **Status:** Under active development; behavior and APIs may still change.

---

## Overview

**Input:** One SVG whose icon is drawn with **strokes** (not only fills)—typical for icons exported from design tools.

**Output:** One SVG that follows Apple’s **square SF Symbol template** layout: multiple size and weight variants merged into the correct groups, ready for preview and further editing in SF Symbols or related tooling.

**Why it exists:** Building SF Symbol sets by hand (every weight × size, stroke-to-fill, template placement) is slow and error-prone. This tool automates the mechanical steps so you can focus on the icon design.

---

## How to use (web UI)

1. **Install and run the stack** (see [Local development](#local-development) below): Python API on port `8000` and the Vite dev server (usually port `5173`).
2. **Open the app** in a browser at the URL Vite prints (e.g. `http://localhost:5173`).
3. **Choose file** and pick a **stroked** `.svg`.
4. Click **Convert**. When processing finishes, the **SF Symbol template SVG** download should start automatically.
5. If something fails, check the on-screen error message—common issues include non-stroked-only artwork, invalid SVG, or a missing template file (see [Template file](#template-file)).

**Input tips**

- Prefer **simple stroked paths**; heavy effects or exotic SVG features may not convert cleanly.
- The pipeline expects stroke-based geometry it can outline and merge; filled-only icons are a different problem.

---

## Local development

**Backend (FastAPI + uvicorn)**

```bash
pip install -e ".[web]"
uvicorn svg_to_sfsymbol.web_api:app --reload --host 127.0.0.1 --port 8000
```

**Frontend (Vite)** — in another terminal:

```bash
cd frontend && npm install && npm run dev
```

Vite proxies `/api` to the backend, so the UI talks to `POST /api/convert` without CORS friction during development.

### Production-style run

Build the frontend, then start uvicorn. If `frontend/dist` exists, the API **serves the built UI at `/`** and keeps **`POST /api/convert`** for uploads.

```bash
cd frontend && npm run build
cd .. && uvicorn svg_to_sfsymbol.web_api:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000` in the browser.

### Template file

Phase 5 needs Apple’s **square SF Symbol template** SVG.

- **Default:** place `resources/square_template.svg` at the **repository root** (alongside `src/`). The CLI and web API pick it up automatically.
- **Override:** point to any file with:

  ```bash
  export SFSYMBOL_TEMPLATE_PATH=/path/to/square_template.svg
  ```

---

## How it works (pipeline)

Processing runs in **phases**, each using the previous output:

1. **Phase 1 — Size variants**  
   Produces square canvases at **large (120×120)**, **medium (90×90)**, and **small (72×72)** user units. Geometry is scaled with **baked coordinates** (affines applied to paths and basic shapes) so stroke widths are not blown up by a parent `scale()`.

2. **Phase 2 — Weight slots**  
   Duplicates each size into nine **weight-named** files (e.g. `Regular-M.svg`, `Black-L.svg`) in SF Symbol weight order, then removes the intermediate `large` / `medium` / `small` filenames. The original upload is kept separately.

3. **Phase 3 — Path weights**  
   Assigns **stroke-width** per weight and scale (L / M / S) from a fixed table aligned with SF Symbol path-weight references.

4. **Phase 4 — Stroke to fill**  
   Expands stroked paths into **filled outlines** (polygonal approximation via sampling and Shapely buffering), strips stroke where converted, and **merges** sibling paths with the same fill when safe.

5. **Phase 5 — SF Symbol template**  
   Merges the weight×size SVGs into the **square template**. Each symbol is placed in the matching `<g id="…">` under `<g id="Symbols">`, **centered with translate only** (no scaling) on the slot’s preview wireframe box, then the **wireframe path** is removed. Guides and template structure stay intact for symbol workflows.

---

## Implementation notes

- **Security:** Untrusted SVG is parsed with **defusedxml** to reduce XML entity / DTD risks.
- **Geometry:** **svg.path** parses and samples paths; **Shapely** handles buffering, unions, and merging filled regions.
- **Resources:** `resources/square_template.svg` is required for phase 5. Some tests expect `resources/calendar-today.svg`; without it, those tests may be skipped or fail until you add the file.
- **CLI:** A phase-1 entry point is exposed as `svg-sfsymbol-phase1` for development and testing; the full flow is normally used via the web API or library code.

## License / contributions

Work in progress; see the repository for license and contribution expectations once they are finalized.
