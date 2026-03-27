# Implementation plan: Archive Python stack and rename web/server folders

**Status:** Implemented (2026-03-27)  
**PRD:** Approved — Archive Python + rename `frontend`→`web`, `api`→`server` (2026-03-27 conversation)  
**Date:** 2026-03-27

---

## Overview

Move the entire Python surface (`src/` package tree, `tests/` pytest suite, `pyproject.toml`, `requirements.txt`) into `.archive/python-legacy/` with a short README marking it reference-only. Rename top-level `frontend` to `web` and `api` to `server`, then fix every documented path and the one runtime path that serves the built UI (`web/dist`). HTTP route `/api/convert` stays unchanged so the Vite proxy and `fetch('/api/convert')` keep working without edits. End state: root README describes only `web` + `server`; no Python tooling at repo root.

---

## Architecture decisions

### Archive layout
Use `.archive/python-legacy/` as a single subtree preserving relative structure (`src/`, `tests/`, `pyproject.toml`, `requirements.txt`). Keeps `pip install -e .` possible from that directory if someone chooses to, without implying support. Add `.archive/python-legacy/README.md` stating reference-only status and that the active stack is `server` + `web`.

### HTTP paths
Do not rename Fastify routes (`/api/convert`). Only filesystem folders `api` and `frontend` change; the word "api" in the URL remains the HTTP API prefix.

### `repoRoot` resolution in Node
`phase5.ts` `repoRootFromModule()` uses `join(here, "..", "..")` from `server/src` (same depth as today’s `api/src`), so repository root and `resources/square_template.svg` resolution stay correct after the folder rename. `app.ts` must change the static UI path from `frontend/dist` to `web/dist`.

---

## File & folder changes

| Action | Path | Notes |
|--------|------|-------|
| Create | `.archive/python-legacy/README.md` | Reference-only notice |
| Move | `src/` → `.archive/python-legacy/src/` | Python package |
| Move | `tests/` → `.archive/python-legacy/tests/` | Pytest |
| Move | `pyproject.toml` → `.archive/python-legacy/pyproject.toml` | |
| Move | `requirements.txt` → `.archive/python-legacy/requirements.txt` | |
| Rename | `frontend/` → `web/` | Vite app |
| Rename | `api/` → `server/` | Fastify + pipeline |
| Modify | `README.md` | Paths, remove Python-as-primary; short pointer to archive |
| Modify | `web/vite.config.ts` | Comment: `../server`; proxy target unchanged URL |
| Modify | `server/src/app.ts` | `FRONTEND_DIST` path segment `frontend` → `web` (consider renaming const to `WEB_DIST`) |
| Modify | `.cursor/context/context-map-svg-to-sfsymbol.md` | Reflect new layout — [deferrable] |

---

## Phased task sequence

### Phase 1 — Archive Python

- [x] Create `.archive/python-legacy/README.md` explaining legacy Python implementation, no longer maintained at root, optional `pip install -e .` from that folder only — S
- [x] Move `pyproject.toml`, `requirements.txt`, `src/`, `tests/` into `.archive/python-legacy/` (git mv) — M
- [ ] Omit or do not track generated `*.egg-info` under archive if present; add ignore rule if the team wants a clean tree — S — [deferrable]

### Phase 2 — Rename folders

- [x] `git mv frontend web` and `git mv api server` — S
- [x] Update `server/src/app.ts` built UI path from `frontend` to `web` — S
- [x] Update `web/vite.config.ts` comments referencing `../api` to `../server` — S

### Phase 3 — Documentation and verification

- [x] Rewrite root `README.md`: single active stack (`web` + `server`); template path note no longer lists `src/` beside `api/`; remove or shorten Python/uvicorn sections; keep pipeline description pointing at `server/src/`; update all `cd api` / `cd frontend` / `frontend/dist` / links to `api/` — M
- [x] Run `cd server && npm test` and `cd web && npm run build` from repo root — S
- [ ] Manual smoke: `server` dev + `web` dev, upload converts — S — [deferrable] if CI covers API tests
- [x] Update `.cursor/context/context-map-svg-to-sfsymbol.md` to match new paths — S — [deferrable]

---

## Risk flags & open technical questions

- **Broken deep links:** External bookmarks to `.../blob/main/api/...` will break after rename; acceptable per PRD; GitHub may redirect for renames in some cases but do not rely on it.
- **package.json `name`:** Field `svg-to-sfsymbol-api` can stay; optional rename to `svg-to-sfsymbol-server` for consistency — decide during implementation (cosmetic).

---

## Out of scope

- Changing `/api/convert` URL or Vite proxy path prefix.
- Removing Python files from the repo (archive only).
- Fixing or running archived pytest in CI.
- Renaming `test/` sample output folders (not part of PRD).
