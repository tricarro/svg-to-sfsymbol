# Review report: Archive Python stack and rename web/server folders

**Date:** 2026-03-27  
**Reviewer role:** Cold read (`/review` skill)  
**Inputs:** Plan on disk; PRD from conversation; no formal IMPL document at review time.

---

## Scope reviewed

Repository reorganization: archive Python to `.archive/python-legacy/`, rename `frontend`→`web` and `api`→`server`, update README and `WEB_DIST`, package names, context map.

---

## Findings (as reported)

### Critical

- None identified for the active Node/web path.

### Major

1. **Archived Python — `default_square_template_path` in `phase5.py`** — After the move, logic that walked up two parents from the package no longer points at repo-root `resources/square_template.svg`.
2. **Archived Python — `web_api.py` `_FRONTEND_DIST`** — Still resolved toward `frontend/dist` under the archive tree, not repo-root `web/dist`.
3. **Archived pytest — `tests/` resource paths** — `Path(__file__).parent.parent / "resources"` now resolves under `.archive/python-legacy/`, not the real `resources/` at repo root.

### Minor

1. **`web/vite.config.ts`** — Comment still described switching the proxy to Python on port 8000.
2. **`README.md`** — “Import from `pipeline.ts`” was ambiguous without `server/src/`.
3. **`.cursor/docs/PLAN-archive-python-rename-web-server.md`** — Checklists still showed `- [ ]` after work was done.

### Suggestion

1. **Vitest** — No automated assertion that static hosting uses `web/dist` when present.

---

## Resolutions (after review)

| Finding | Resolution |
|---------|------------|
| All Major items | **Accepted / intentionally not fixed** — user instruction: ignore Major issues. |
| Minor (Vite Python comment) | **Fixed** — line removed. |
| Minor (README import path) | **Fixed** — link to `server/src/pipeline.ts` and note `server/dist/pipeline.js`. |
| Minor (plan checkboxes) | **Fixed** — completed tasks marked `[x]`. |
| Suggestion (test for static dist) | **Deferred** — not requested. |

---

## Follow-up recommendations (optional, not done)

- Repair archived Python path math and pytest fixtures if the archive should be runnable again.
- Add root `.gitignore` for `.venv/`, `node_modules/`, `.DS_Store` and stop tracking `server/node_modules` if bundle size matters.
- Add a small integration or filesystem test for `WEB_DIST` registration.
