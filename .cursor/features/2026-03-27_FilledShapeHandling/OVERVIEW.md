# Overview: Archive Python stack and rename web/server folders

**Date completed:** 2026-03-27  
**Cycle artifacts:** PRD.md · PLAN.md · IMPL.md · REVIEW.md in `.cursor/docs/2026-03-27-archive-python-rename-web-server/` (PRD was agreed in chat and captured here; no separate file existed before this archive)

---

## What was built and why

The repository used to look like a dual-stack product: Python at the root (`src/`, `tests/`, `pyproject.toml`) alongside Node (`api/`) and a Vite app (`frontend/`). The goal was to make the **Node + Vite** stack the clear source of truth, move **all Python** material into an archive for historical reference only, and rename folders so names match roles: **`web`** for the browser UI and **`server`** for the Fastify API and conversion pipeline. That reduces confusion for anyone cloning the repo and matches the decision to stop maintaining Python at the root.

---

## How it works

- **`.archive/python-legacy/`** holds the former root Python package (`src/svg_to_sfsymbol/`), pytest suite (`tests/`), `pyproject.toml`, and `requirements.txt`, plus a short README stating the folder is reference-only. Optional `pip install -e ".[web]"` from that directory is documented as unsupported for the main product path.
- **`web/`** is the Vite application (renamed from `frontend/`). Dev proxy still forwards `/api` to `http://127.0.0.1:3000`; the HTTP path prefix `/api` was intentionally **not** renamed (only directory names changed).
- **`server/`** is the Fastify app (renamed from `api/`). Compiled and dev entrypoints resolve the repo root the same way as before (`server/src` → two levels up). **Static production UI** is served from **`web/dist`** via `WEB_DIST` in `server/src/app.ts` (replacing `frontend/dist`).
- **Root `README.md`** documents only `web` + `server`, describes the five-phase pipeline against `server/src/`, and points to the archive for legacy Python.
- **`.cursor/context/context-map-svg-to-sfsymbol.md`** was updated so agent context matches the new layout.
- **Commit `b33a40d`** on `main` records the reorganization; `.venv/` and `.DS_Store` were excluded from that commit.

---

## What was explicitly left out

- **HTTP contract:** No change to `POST /api/convert` or the Vite proxy path.
- **Python deletion:** Python code remains in the repo under `.archive/python-legacy/`.
- **Algorithm / API behavior:** No conversion logic changes beyond path resolution for the built UI.
- **Sample `test/` trees:** The top-level `test/` folders (sample SF Symbol outputs) were not renamed.
- **CI:** No requirement to run archived pytest or add Python jobs; root CI was not verified in depth.
- **Plan deferrals:** Optional cleanup of tracked `*.egg-info` / ignore rules; manual smoke test of dev servers together.
- **Post-review (Major):** Archived Python’s internal paths (`phase5` default template, `web_api` static dir, pytest `resources/` assumptions) were **not** fixed; they still assume the old layout relative to the archive. The user chose to fix only **Minor** review items (see REVIEW.md).

---

## Known limitations & gotchas

- **Deep links** to old paths (`api/`, `frontend/` on GitHub) break after rename; use `server/` and `web/`.
- **Archived Python** is not path-aligned with repo-root `resources/` or `web/dist` without further edits; treat archive as browse-only unless someone repairs those paths.
- This repo has historically **tracked `server/node_modules`** (moved with `api` → `server`); clones are large. Consider untracking and using `.gitignore` in a follow-up.
- **Review Suggestion** (automated test for `web/dist` static registration) was not implemented.

---

## Review findings & resolutions

A cold `/review` pass identified **3 Major**, **3 Minor**, and **1 Suggestion**.

| Severity | Topic | Resolution |
|----------|--------|------------|
| Major | Archived Python template/static/pytest paths wrong vs new layout | **Accepted** (user: ignore Majors) |
| Minor | Vite config still mentioned Python proxy | **Fixed** — comment removed |
| Minor | README `pipeline.ts` import ambiguous | **Fixed** — points to `server/src/pipeline.ts` and `server/dist/pipeline.js` |
| Minor | Plan checkboxes stale | **Fixed** — completed items marked `[x]` |
| Suggestion | Test coverage for static `web/dist` | **Deferred** |

---

## Files touched

See **IMPL.md** for the chronological step list and file-level detail. At a high level: new `.archive/python-legacy/README.md`; moves under `.archive/python-legacy/`; renames `frontend` → `web`, `api` → `server`; edits to `README.md`, `server/src/app.ts`, `web/vite.config.ts`, `server/package.json`, `web/package.json`, `.cursor/context/context-map-svg-to-sfsymbol.md`, `.cursor/docs/PLAN-archive-python-rename-web-server.md`; additions `.nvmrc`, `resources/square_variable_template.svg`, `.cursor/docs/PLAN-archive-python-rename-web-server.md`, and this dated feature folder (`2026-03-27-archive-python-rename-web-server`).
