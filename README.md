# SVG to SF Symbol

Convert a single **SVG icon** into an **SF Symbol–style template SVG** you can use in Apple’s symbol tooling: either the **square** stroked template (stroke-only and mixed stroke+fill artwork) or the **variable** filled template (fill-only artwork).

This repo ships a **Vite + TypeScript** browser UI ([`web/`](web/)), a **Fastify** API ([`server/`](server/)) that runs the conversion, and a **`build-pipeline`** workspace ([`build-pipeline/`](build-pipeline/))—a self-contained copy of the same pipeline for imports/tests without HTTP. Legacy **Python** lives under [`.archive/python-legacy/`](.archive/python-legacy/) for reference only.

> **Status:** Active development; behavior and APIs may change.

---

## Requirements

- **Node.js `20.15.1`** (see [`.nvmrc`](.nvmrc)). The server package pins that engine; `build-pipeline` allows `>=20.15.1`.

---

## Repository layout

| Path | Role |
|------|------|
| [`web/`](web/) | Vite + TypeScript UI ([Momentum Design](https://github.com/momentum-design/momentum-design) `@momentum-design/*`). **Not** an npm workspace—install dependencies inside `web/`. |
| [`server/`](server/) | Fastify app, `POST /api/convert`, static `web/dist` when present, conversion code under `server/src/`, Vitest. |
| [`build-pipeline/`](build-pipeline/) | Standalone pipeline package (step-oriented modules, own [`build-pipeline/resources/`](build-pipeline/resources/) templates). See [`build-pipeline/README.md`](build-pipeline/README.md). |
| [`resources/`](resources/) | Repo-root templates: `square_template.svg`, `square_variable_template.svg`. |
| [`tests/mixedIcon/`](tests/mixedIcon/) | Optional **Paper.js** terminal experiment for mixed icons (separate from the main converter). |
| [`.features/`](.features/) | Internal feature-cycle notes (PRD/plan/overview); not required to run the app. |
| [`.archive/python-legacy/`](.archive/python-legacy/) | Archived Python implementation and tests. |

Root [`package.json`](package.json) defines **npm workspaces** `server` and `build-pipeline` only.

---

## What goes in / what comes out

**Input:** One `.svg`. The server classifies it (stroke detection and routing in [`server/src/svgStrokeDetection.ts`](server/src/svgStrokeDetection.ts)):

- **Stroke-only** and **mixed** (stroke + fill): square pipeline after optional preprocessing so filled regions become stroked boundaries for mixed icons.
- **Fill-only:** scaled into the variable template (`Ultralight-S`, `Regular-S`, `Black-S` slots).

**Output:** Downloadable template SVG:

- Square route: `{name}_SFSymbol.svg`
- Variable route: `{name}-SFSymbol.svg`

The root `<svg>` must have a **`viewBox`** or numeric **`width`/`height`** (not percentages); otherwise the API returns a validation error.

**Upload limit:** **5 MiB** per file (`MAX_UPLOAD_BYTES` in [`server/src/app.ts`](server/src/app.ts)).

---

## Local development

### 1. Install

From the repository root (workspaces + lockfile):

```bash
npm install
```

Install the **web** app separately (it is not part of workspaces):

```bash
cd web && npm install && cd ..
```

### 2. Run the API

```bash
cd server && npm run dev
```

Listens on **`http://127.0.0.1:3000`** by default (`PORT`, `HOST` in [`server/src/server.ts`](server/src/server.ts)).

### 3. Run the UI (second terminal)

```bash
cd web && npm run dev
```

Open the URL Vite prints (typically **`http://localhost:5173`**). [`web/vite.config.ts`](web/vite.config.ts) proxies **`/api`** to `http://127.0.0.1:3000`.

### 4. Tests

| Scope | Command |
|--------|---------|
| **Both workspaces** (root) | `npm test` — runs `build-pipeline` then `server` Vitest suites. |
| **Server only** | `cd server && npm test` |
| **build-pipeline only** | `cd build-pipeline && npm test` |

Production-style server after compile:

```bash
cd server && npm run build && npm start
```

---

## Production-style run (API + built UI)

Build the web app, then build and start the server. If `web/dist` exists, the server serves the SPA at `/` and still exposes **`POST /api/convert`**.

```bash
cd web && npm run build
cd ../server && npm run build && npm start
```

Browse **`http://127.0.0.1:3000`** (or your `HOST`/`PORT`).

---

## Template paths (environment)

| Variable | Purpose |
|----------|---------|
| `SFSYMBOL_TEMPLATE_PATH` | Override **square** template (default: `resources/square_template.svg` at repo root, resolved by server). |
| `SFSYMBOL_VARIABLE_TEMPLATE_PATH` | Override **variable** template (default: `resources/square_variable_template.svg`). |

Example:

```bash
export SFSYMBOL_TEMPLATE_PATH=/path/to/square_template.svg
export SFSYMBOL_VARIABLE_TEMPLATE_PATH=/path/to/square_variable_template.svg
```

---

## Pipeline (square route)

Implementation: **`server/src/`** (phases). The **`build-pipeline`** package mirrors the flow with different option names—keep them in sync when changing behavior (see **Dual TypeScript trees** below).

1. **Phase 1 — Size variants** — Large (164×164), medium (136×136), small (112×112) squares; affines baked into geometry so strokes are not scaled incorrectly by parent `transform`.
2. **Phase 2 — Weight slots** — Nine weight names per size in SF Symbol order; intermediate size filenames removed.
3. **Phase 3 — Stroke widths** — Per weight and scale (L/M/S) from a fixed table.
4. **Phase 4 — Stroke to fill** — Stroked outlines → filled geometry (**JSTS**); sibling merge pass disabled (matches legacy Python).
5. **Phase 5 — Template merge** — Places each variant in the square template `<g id="Symbols">…`, centers with **translate only**, removes preview wireframes.

**Fill-only** path bypasses these phases and merges into the variable template in [`server/src/variableTemplateFilled.ts`](server/src/variableTemplateFilled.ts).

---

## Implementation notes

| Topic | Details |
|-------|---------|
| **HTTP** | Fastify — [`server/src/app.ts`](server/src/app.ts), [`server/src/server.ts`](server/src/server.ts) |
| **XML** | `@xmldom/xmldom` (DOCTYPE stripped before parse where applicable) |
| **Paths** | `svgpath` |
| **Stroke → fill** | `jsts` |
| **Routing** | `classifySvgRouting` — filled → variable merge; mixed → [`mixedIconToStrokedSvg.ts`](server/src/mixedIconToStrokedSvg.ts) then square pipeline; stroke-only → square pipeline. [`mixedIconToFilled.ts`](server/src/mixedIconToFilled.ts) is for tests/reuse, not the HTTP convert path. |

**Programmatic use**

- **Server:** `runFullConvert` from [`server/src/pipeline.ts`](server/src/pipeline.ts) (use `server/dist/` after `npm run build`).
- **Package:** `import { runFullConvert } from "build-pipeline"` after `cd build-pipeline && npm run build` — options per [`build-pipeline/src/runFullConvert.ts`](build-pipeline/src/runFullConvert.ts) (`sizeVariantsOnly`, `squareTemplatePath`, `mergedSvgOutputPath`, etc.). No CLI.

**Fixtures:** [`server/src/phase4.test.ts`](server/src/phase4.test.ts) runs an extra calendar check **only if** `resources/calendar-today.svg` exists; omitting that file is fine.

### Dual TypeScript trees

The **server** and **`build-pipeline`** packages both contain conversion logic. Until the server is rewired to the package, **edit both** (or accept drift). Template copies live under **`resources/`** (server defaults) and **`build-pipeline/resources/`** (package defaults).

---

## Optional: `tests/mixedIcon`

Isolated Node + Paper.js + Maker.js experiment for mixed-icon handling. Not wired to the Fastify app. Setup and usage: [`tests/mixedIcon/README.md`](tests/mixedIcon/README.md).

---

## License / contributions

Work in progress; add a `LICENSE` and contribution guidelines when you are ready to publish them.
