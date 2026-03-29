# PRD: Archive Python stack and rename web/server folders

**Status:** Approved (2026-03-27)  
**Date:** 2026-03-27  

---

## Problem statement

The repository currently presents two full implementations of the conversion pipeline (Python and Node) at the root, with generic folder names (`frontend`, `api`) that do not state their roles. The team has decided to standardize on the Node.js server and Vite web app only. Without moving the Python package, tests, and packaging metadata out of the active tree and without renaming the primary folders, contributors and tools keep treating Python as a first-class path and the layout stays ambiguous.

---

## Goals & success criteria

- All Python-related source, tests, and packaging files live under `.archive/` and are documented as reference-only — verified by no `pyproject.toml`, `requirements.txt`, `tests/` (pytest), or `src/svg_to_sfsymbol/` at repository root after the change.
- Active application folders use role-oriented names: former `frontend` is `web`, former `api` is `server` — verified by directory names and updated path references in scripts, config, and documentation.
- Root `README.md` describes the active stack using `web` and `server` only, and states that Python lives under `.archive` for historical reference — verified by reading the README; no instructions that imply Python is required for normal development or deployment.
- References that embed old paths (e.g. `cd frontend`, `cd api`, `../api`, static file paths to `frontend/dist`) are updated so a clean clone can follow documented steps without path errors — verified by grep or manual checklist against README and config files.
- Python under `.archive` is not required to pass CI from the default pipeline; if CI still runs Python jobs, they are removed or scoped so the default build/test path is Node/web only — verified by CI config review.

---

## User stories

- As a developer cloning the repo, I want the top-level folders to be named `web` and `server`, so that I immediately know which is the UI and which is the HTTP + conversion backend.
- As a maintainer, I want all Python modules, pytest tests, `pyproject.toml`, and `requirements.txt` under `.archive`, so that the root layout matches the single active runtime (Node).
- As a developer following the README, I want install and run commands to use `web` and `server` paths, so that I do not run obsolete Python setup steps by mistake.
- As someone debugging old behavior, I want the archived Python tree to remain browsable with a sensible internal layout (not a flat dump of unrelated files), so that I can compare implementations without restoring files to the root.
- As a frontend developer, I want the Vite dev proxy and any documented API base URL to keep working after the rename, so that local `web` development still reaches the `server` on the expected port.
- As a release or deploy reader, I want production-style instructions (build UI, start server) to reference `web/dist` (or equivalent) and the `server` entrypoint, so that deployment docs match the filesystem.

---

## Out of scope / non-goals

- Deleting the Python code; it must remain in the repository under `.archive` for reference.
- Porting missing Python-only features into Node as part of this reorganization.
- Changing conversion algorithms, API contracts, or UI behavior beyond what path renames require.
- Renaming npm package names inside `server/package.json` or internal module filenames unless required for clarity or broken imports (default: keep `server` folder as the primary user-facing label; package.json `name` field is optional to change).
- Guaranteeing that archived Python remains installable or that all pytest tests pass in CI without maintenance; reference-only means no ongoing support commitment in this PRD.

---

## Constraints & risks

- Any tool or script that hardcodes `frontend/` or `api/` (including parent README links, Vite `proxy` comments, `server` static hosting of built UI) must be updated or local dev and deploy instructions will break.
- IDE bookmarks, personal scripts, and external docs outside the repo will not update automatically.
- If `.archive` is ignored by some tooling, that is acceptable; if something must index the repo, confirm `.archive` is not excluded by `.gitignore` unintentionally (implementation should preserve archived files in version control).
- Moving `tests/` (pytest) out of root may break contributors’ muscle memory; README must point to `.archive/...` for “where the old tests live.”

---

## Open questions

- Exact subdirectory layout under `.archive` (e.g. single folder `.archive/python-legacy/` containing `src`, `tests`, `pyproject.toml`, `requirements.txt`, and a short `README` vs multiple top-level blobs) — resolved during implementation as `.archive/python-legacy/`.
- Whether to add a one-file `README.md` inside `.archive` explaining reference-only status — done as `.archive/python-legacy/README.md`.
- Whether CI exists today for Python at repo root; if absent, the “CI scoped to Node only” goal is already satisfied by documentation and not adding Python jobs.
