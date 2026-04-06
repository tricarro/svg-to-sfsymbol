# Context map: server

**Scanned:** 2026-04-06  
**Scope:** `server/` (source, config, tests; excluding `node_modules` / `dist` contents)  
**Project:** svg-to-sfsymbol  

---

## Project shape

Monorepo slice: **`server/`** is the Node **Fastify** backend for SVG → SF Symbol conversion. It exposes **`POST /api/convert`**, runs a **multi-phase pipeline** for stroked icons into the square template, and a **separate path** for fill-only / mixed icons into the variable template. The **`web/`** Vite app proxies `/api` here in dev; if **`web/dist`** exists, this server can also serve the static UI at `/`.

---

## What exists in scope

- `server/package.json` — package `svg-to-sfsymbol-server`, scripts: `build` (tsc), `start` (node dist/server.js), `dev` (tsx watch), `test` (vitest); **Node 20.15.1**
- `server/tsconfig.json` — `strict`, `ES2022`, `NodeNext` / `NodeNext`, `outDir: dist`, `rootDir: src`, declarations on
- `server/vitest.config.ts` — node env, `src/**/*.test.ts`
- `server/src/`
  - `server.ts` — entry: `PORT` / `HOST`, `buildApp().listen`
  - `app.ts` — Fastify app: multipart, `/api/convert`, optional `@fastify/static` for `web/dist`; **`convertSync`**, **`resolveSquareTemplate`**, **`safeStem`**, **`MAX_UPLOAD_BYTES`**
  - `pipeline.ts` — **`runFullConvert`**: orchestrates phase1→phase5 with skip/phase1Only options
  - `phase1.ts` … `phase5.ts` — size variants, weight slots, stroke-width table, stroke→fill (JSTS), template merge
  - `xml.ts` — **`parseSvgXml`**, **`stripDoctype`** (XXE hardening note in file comment), `@xmldom/xmldom`
  - `svgAffineBake.ts` — affine baking for paths/shapes
  - `svgStrokeDetection.ts` — **`classifySvgRouting`** (stroke vs filled vs mixed heuristics)
  - `mixedIconToFilled.ts` — mixed stroke+fill → fill-only SVG string for variable path
  - `variableTemplateFilled.ts` — merge into variable template; env **`SFSYMBOL_VARIABLE_TEMPLATE_PATH`**
  - `*.test.ts` — Vitest tests co-located with modules (`app`, phases, stroke detection, variable template, mixed icon)
- `server/dist/` — compiled output (present in repo scan; typically gitignored or build artifact)

---

## Patterns in use

- **ESM**: `"type": "module"`; TypeScript imports use **`.js` suffix** for local modules (`from "./app.js"`) under NodeNext
- **No `src/index.ts` barrel** — consumers import concrete modules (`pipeline`, `app`, etc.)
- **Tests**: same directory as implementation, `*.test.ts`, Vitest
- **Temp I/O for stroked path**: `convertSync` writes upload to **`mkdtempSync`** under OS tmp, runs `runFullConvert`, reads merged SVG
- **Templates**: square template via **`SFSYMBOL_TEMPLATE_PATH`** or default `resources/square_template.svg` (repo root relative to server module layout); variable path via **`SFSYMBOL_VARIABLE_TEMPLATE_PATH`** (see `variableTemplateFilled.ts`)
- **HTTP errors**: `app.ts` maps message substrings to **400 / 413 / 503 / 500** for convert failures

---

## Relevant config

- **TypeScript**: `strict: true`, `target`/`lib` ES2022, `module`/`moduleResolution` NodeNext, `outDir: dist`, `include: src/**/*.ts`
- **Dependencies**: `fastify`, `@fastify/multipart`, `@fastify/static`, `@xmldom/xmldom`, `jsts`, `svgpath`
- **Dev**: `tsx`, `typescript` ~5.6, `vitest` ^2.1, `@types/node` ^20

---

## Docs & notes

- Root **`README.md`** documents server dev (`cd server && npm run dev` on **127.0.0.1:3000**), production run, template env vars, and phase 1–5 behavior; status: active development
- **`xml.ts`** documents stripping DOCTYPE before parse for XXE / entity hardening
- **Stroke detection** is explicitly heuristic (presentation attrs + simple inline `style`); README lists limitations (`<use>`, complex CSS, etc.)
- **Programmatic API**: import **`runFullConvert`** from `pipeline` (README); no separate CLI in server package

---

## Gaps & unknowns

- Did not verify **`.gitignore`** treatment of `server/dist` or CI wiring for this package
- **Phase internals** (exact file naming, JSTS tuning) not fully read file-by-file; README + `pipeline.ts` are the authoritative flow summary
- **Root `package.json`**: none at repo root in this workspace snapshot; server is standalone npm package under `server/`

---

## Loaded for downstream use

The following context is now active for this session:
- **Stack:** Node 20 + Fastify + TypeScript (ESM) + Vitest; XML via @xmldom with DOCTYPE strip; geometry via svgpath + JSTS
- **Patterns:** `.js` import extensions; flat `src/` modules; co-located `*.test.ts`; temp-dir stroked conversion; env-overridable template paths
- **Constraints:** **5 MiB** upload cap; `.svg` only; square pipeline needs resolvable square template; variable path needs variable template; routing split by `classifySvgRouting`
- **Scope boundary:** `server/` package only; **`web/`** and **`resources/`** are adjacent dependencies (paths and README references)
