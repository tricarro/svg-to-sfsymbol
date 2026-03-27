# Context map: svg-to-sfsymbol (repository root)

**Scanned:** 2026-03-27 (updated after reorg)  
**Scope:** Repository root and first-level packages (`web/`, `server/`, `resources/`, `test/`, `.archive/python-legacy/`).  
**Project:** svg-to-sfsymbol  

---

## Project shape

Tool: converts **stroked** SVG icons into a **merged Apple square SF Symbol template SVG** via a **five-phase pipeline**. **Active stack:** **Node.js** Fastify server (`server/`) + **Vite** web UI (`web/`). **Python** implementation archived under `.archive/python-legacy/` (reference only). HTTP upload flow: browser → `POST /api/convert` on the server (Vite dev proxy forwards `/api` to port 3000).

---

## What exists in scope

- **Root**
  - `README.md` — purpose, `web` + `server` dev/prod, pipeline phases, template env (`SFSYMBOL_TEMPLATE_PATH`), pointer to archive

- `server/` **(Node HTTP + pipeline)**
  - `package.json` — Fastify, Vitest; name `svg-to-sfsymbol-server`
  - `src/` — `server.ts`, `app.ts`, `pipeline.ts`, `phase1.ts`–`phase5.ts`, `svgAffineBake.ts`, `xml.ts`; tests co-located

- `web/`
  - Vite + TypeScript UI; Momentum Design deps; proxies `/api` → `127.0.0.1:3000`

- `.archive/python-legacy/`
  - `README.md` — reference-only notice
  - `src/svg_to_sfsymbol/`, `tests/`, `pyproject.toml`, `requirements.txt` — legacy Python (not part of default workflow)

- `tests/` — **removed from root** (now under `.archive/python-legacy/tests/`)

- `resources/` — `square_template.svg` (phase 5); optional fixtures

- `test/` — sample `*_SFSymbol` output trees (not pytest)

---

## Patterns in use

- **Single active pipeline:** TypeScript in `server/src/`; archive mirrors old Python phases for comparison only.
- **Node server:** ESM, strict TypeScript, `NodeNext`, `server/dist/` for production.
- **Folder names:** `web` = UI, `server` = API + conversion (HTTP path prefix remains `/api/...`).
- **Repo root resolution:** `phase5.ts` walks up from `server/src` to repo root for `resources/square_template.svg`.

---

## Relevant config

- **Node:** `.nvmrc` `20.15.1`; server `engines.node` aligned
- **TypeScript (server):** ES2022, `strict`, out `dist`
- **TypeScript (web):** ES2023 + DOM, `strict`, Vite bundler
- **Template path:** `resources/square_template.svg` at repo root or `SFSYMBOL_TEMPLATE_PATH`

---

## Docs & notes

- Archived Python: optional `pip install -e ".[web]"` from `.archive/python-legacy/` only; unsupported for main product path.
- Vitest may use `resources/calendar-today.svg` when present.

---

## Gaps & unknowns

- No root CI config was verified in this update pass.
- `web/package.json` version remains `0.0.0` (cosmetic).

---

## Loaded for downstream use

The following context is now active for this session:
- **Stack:** Node 20 Fastify + Vite TS web (Momentum Design); Python archived
- **Patterns:** Phase-numbered server modules; `/api` HTTP prefix; `web`/`server` directory names
- **Constraints:** Stroked-SVG input; phase 5 needs template at `resources/` or env
- **Scope boundary:** Active code in `server/` and `web/`; legacy in `.archive/python-legacy/`
