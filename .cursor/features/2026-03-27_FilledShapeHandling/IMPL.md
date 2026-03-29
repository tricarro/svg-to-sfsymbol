# Implementation summary: Archive Python stack and rename web/server folders

**Date:** 2026-03-27  
**Commit:** `b33a40d` (subject: `chore: archive Python to .archive/python-legacy, rename api→server and frontend→web`)

---

## Chronological steps

### 1. Context and product definition

- **`/context-gathering`** — Scanned the repo root and produced `.cursor/context/context-map-svg-to-sfsymbol.md` (later updated after the reorg).
- **`/ideate`** — Interview (archive scope: whole Python surface; renames `frontend`→`web`, `api`→`server`; Python reference-only). User approved the PRD in chat.
- **`/plan`** — Wrote `.cursor/docs/PLAN-archive-python-rename-web-server.md` (duplicate of `PLAN.md` in this folder). User approved the plan.

### 2. Implementation (`/implement`)

1. **Created** `.archive/python-legacy/README.md` (reference-only notice, optional pip from that directory).
2. **Staged and moved with Git:**
   - `git add .archive/python-legacy/README.md`
   - `git mv src tests pyproject.toml requirements.txt .archive/python-legacy/`
   - `git mv frontend web`
   - `git mv api server`
3. **Edited `server/src/app.ts`:** Replaced `FRONTEND_DIST` with `WEB_DIST`, path segment `frontend` → `web`.
4. **Edited `web/vite.config.ts`:** Comment now references `../server` and `cd server` (Python proxy note removed in a later pass).
5. **Edited `server/package.json`:** `"name": "svg-to-sfsymbol-server"`.
6. **Edited `web/package.json`:** `"name": "svg-to-sfsymbol-web"`.
7. **Rewrote root `README.md`** for `web` + `server` only, layout table, pipeline under `server/src/`, archive pointer.
8. **Updated** `.cursor/context/context-map-svg-to-sfsymbol.md` for the new layout.
9. **Marked plan implemented** in `.cursor/docs/PLAN-archive-python-rename-web-server.md` and checked off completed tasks.
10. **Verification:** `cd server && npm test` (Vitest, 7 tests), `cd server && npm run build`, `cd web && npm run build`.

### 3. Review and follow-up fixes

- **`/review`** — Reported 3 Major (archived Python path drift), 3 Minor, 1 Suggestion. User asked to fix **Minor** only.
- **Minor fixes:**
  - Removed remaining Python FastAPI line from `web/vite.config.ts`.
  - README programmatic use row: explicit `server/src/pipeline.ts` and `server/dist/pipeline.js`.
  - Plan file: `[x]` on completed checklist items (deferrables left unchecked).

### 4. Commit

- `git add -A` then `git reset HEAD -- .venv .DS_Store` to avoid committing local environment junk.
- Single commit **`b33a40d`** including renames, archive, README, `.cursor` docs, `.nvmrc`, `resources/square_variable_template.svg`, and the full `server/node_modules` tree as already tracked in this repository.

---

## Files created

| Path |
|------|
| `.archive/python-legacy/README.md` |
| `.cursor/context/context-map-svg-to-sfsymbol.md` (initial pass; later updated) |
| `.cursor/docs/PLAN-archive-python-rename-web-server.md` |
| `.cursor/docs/2026-03-27-archive-python-rename-web-server/*` (this documentation set) |

---

## Files moved (git mv)

| From | To |
|------|-----|
| `src/` | `.archive/python-legacy/src/` |
| `tests/` | `.archive/python-legacy/tests/` |
| `pyproject.toml` | `.archive/python-legacy/pyproject.toml` |
| `requirements.txt` | `.archive/python-legacy/requirements.txt` |
| `frontend/` | `web/` |
| `api/` | `server/` |

---

## Files modified (content)

| Path | Change |
|------|--------|
| `README.md` | Full rewrite for web/server; later tweak for `pipeline` import path |
| `server/src/app.ts` | `WEB_DIST` → `web/dist` |
| `web/vite.config.ts` | Comments; removed Python proxy hint |
| `server/package.json` | Package name |
| `web/package.json` | Package name |
| `.cursor/context/context-map-svg-to-sfsymbol.md` | Structure and stack description |
| `.cursor/docs/PLAN-archive-python-rename-web-server.md` | Status + checkboxes |

---

## Also staged in the same commit (untracked → added)

- `.nvmrc`
- `resources/square_variable_template.svg`
- `.cursor/docs/` and `.cursor/context/` as applicable to the commit snapshot

---

## Notes for QA

- Confirm **`cd server && npm run dev`** and **`cd web && npm run dev`** together; upload flow uses `/api/convert` unchanged.
- Confirm **`web/dist`** exists after `cd web && npm run build` and that **`cd server && npm start`** serves the SPA at `/` when dist is present.
- Archived Python under `.archive/python-legacy/` is not validated as part of default workflows.
