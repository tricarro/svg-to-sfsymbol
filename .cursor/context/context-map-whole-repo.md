# Context map: whole repository (excluding `.archive`)

**Scanned:** 2026-03-28  
**Scope:** Repository root, `web/`, `server/`, `resources/` (`.archive/` intentionally omitted)  
**Project:** svg-to-sfsymbol (`svg-to-sfsymbol-server` / `svg-to-sfsymbol-web`)

---

## Project shape

Monorepo-style **two-package** app: **Vite + TypeScript** browser UI in `web/` and **Fastify + TypeScript** API in `server/` that runs a **five-phase SVG pipeline** (sizes → weight slots → stroke widths → JSTS stroke-to-fill → merge into Apple square SF Symbol template). **Node 20.15.1** pinned via root `.nvmrc` and `server/package.json` `engines`. **`.archive/`** holds legacy Python; active work is Node only.

---

## What exists in scope

- **Root**
  - `README.md` — authoritative layout, dev commands, pipeline phase descriptions, template env var
  - `.nvmrc` — `20.15.1`
- **`web/`** — Vite app
  - `index.html` — mounts `#app`, loads `/src/main.ts`
  - `vite.config.ts` — proxies **`/api` → `http://127.0.0.1:3000`**
  - `src/main.ts` — Momentum Design (Webex) tokens/components; file picker + **`POST /api/convert`** (FormData `file`); download from `Content-Disposition`; toasts; dev-only `window.__demoSvg`
  - `src/style.css` — app styling
  - `public/` — `favicon.svg`, `icons.svg`, **`public/hero-mesh/mesh-1.svg` … mesh-7.svg** (hero background)
  - `dist/` — built static assets (when present; used by server in production-style run)
- **`server/`** — Fastify API + pipeline
  - `src/server.ts` — `buildApp()`, listen `PORT`/`HOST` (default `3000` / `127.0.0.1`)
  - `src/app.ts` — multipart upload, **`POST /api/convert`**, `convertSync` → `runFullConvert`; serves **`../web/dist`** via `@fastify/static` when `web/dist` exists; `MAX_UPLOAD_BYTES` = 5 MiB; `resolveSquareTemplate()` / `SFSYMBOL_TEMPLATE_PATH`
  - `src/pipeline.ts` — **`runFullConvert`** orchestrates `phase1`–`phase5` with skip flags and phase5 options
  - `src/phase1.ts`–`phase5.ts` — per README phase semantics
  - `src/xml.ts` — **`stripDoctype`** then `@xmldom/xmldom` parse; fatal parse errors throw
  - `src/svgAffineBake.ts` — affine baking for paths (used in early phases)
  - `src/app.test.ts`, `src/phase4.test.ts` — Vitest
  - `dist/` — `tsc` output (committed or build artifact; matches `src` modules)
- **`resources/`**
  - `square_template.svg` — default phase 5 template (path resolved from `server` up to repo root)
  - `square_variable_template.svg` — present; role not fully traced in this scan (not referenced in `phase5` default helper)
- **`.cursor/features/`** — feature-cycle docs; **`current`** → `2026-03-27_FilledShapeHandling` (symlink); separate dated folder `2026-03-27-archive-python-rename-web-server` with PRD/PLAN/etc.

---

## Patterns in use

- **ESM everywhere:** `"type": "module"`; server imports use **`.js` extensions** in TS source (NodeNext).
- **Server build:** `tsc` → `dist/`; run `node dist/server.js`.
- **Web build:** `tsc && vite build`; strict TS with `verbatimModuleSyntax`, `noUnusedLocals`, etc.
- **API contract:** Single conversion endpoint **`POST /api/convert`**; success returns raw SVG bytes with `Content-Type: image/svg+xml` and attachment filename `*_SFSymbol.svg`; errors often JSON `{ detail: string }`.
- **Temp work:** `convertSync` uses `mkdtempSync` under OS `tmpdir()` for input + output paths passed to `runFullConvert`.
- **Template resolution:** Env **`SFSYMBOL_TEMPLATE_PATH`** overrides; else **`resources/square_template.svg`** relative to repo root (via `phase5.defaultSquareTemplatePath` climbing from `server/src`).
- **XML safety:** DOCTYPE stripped before parse (`xml.ts`); document comments cite XXE/entity hardening.
- **UI stack:** Cisco/Momentum Design packages (`@momentum-design/*`) loaded in `main.ts`; no separate framework router.

---

## Relevant config

- **Server TS:** `strict: true`, `module`/`moduleResolution` **NodeNext**, `target` **ES2022**, `outDir` **dist**, `rootDir` **src**
- **Web TS:** `strict: true`, **bundler** resolution, `noEmit: true`, **ES2023** + DOM libs
- **Server deps:** `fastify`, `@fastify/multipart`, `@fastify/static`, `@xmldom/xmldom`, `svgpath`, `jsts`
- **Web deps:** Vite 5; Momentum tokens/components/icons/fonts
- **Vitest:** `server/vitest.config.ts` (not opened in detail; tests invoked via `cd server && npm test`)

---

## Docs & notes

- Root **README** documents phases 1–5, dev/prod run, proxy behavior, template file location, and points programmatic consumers to **`runFullConvert`** in `server/src/pipeline.ts`.
- **Production-style:** build `web` first so `web/dist` exists; server then serves UI at `/` and still exposes **`/api/convert`**.
- **README:** Phase 4 sibling-path merge is **disabled** (aligned with legacy Python); stroke→fill uses **JSTS** buffering.
- **Variable template:** `square_variable_template.svg` exists alongside `square_template`; default pipeline uses **`square_template.svg`** unless env overrides.

---

## Gaps & unknowns

- **`.pytest_cache/`** at repo root suggests pytest was run here; relationship to current Node-only workflow unclear (possibly leftover from archive or local experiment).
- **`square_variable_template.svg`:** not referenced by `defaultSquareTemplatePath`; exact integration or future use not determined from this scan.
- **Whether `server/dist` is intentionally committed** and kept in sync with `src` — policy not stated in README.
- **FilledShapeHandling** active feature folder has only **README**; no `1_`–`4_` artifacts yet — in-repo code linkage to that name not established beyond possible **phase 4 / fill-rule** work.

---

## Loaded for downstream use

The following context is now active for this session:

- **Stack:** Node 20 + Fastify API + Vite/TS web + @xmldom/xmldom + svgpath + JSTS; Momentum Design on the client
- **Patterns:** ESM + `.js` import specifiers on server; single multipart upload endpoint; temp dir per conversion; DOCTYPE strip before XML parse
- **Constraints:** 5 MiB upload cap; `.svg` only; template required for full merge (phase 5); dev needs both server (3000) and Vite (5173) unless using built `web/dist` on server
- **Scope boundary:** Scanned active `web/`, `server/`, `resources/`, root docs; **excluded** `.archive/` per request; did not deep-read every phase file or all tests
