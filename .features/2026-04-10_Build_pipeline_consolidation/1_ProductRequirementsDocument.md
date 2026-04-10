# PRD: Build pipeline consolidation (server refactor)

Status: Draft  
Date: 2026-04-10  

---

## Problem statement

The conversion logic under `server/src` is spread across files named `phase1.ts` through `phase5.ts`, which describe execution order rather than what each step does. That layout makes it harder to navigate, onboard, and align with an external asset builder such as the Momentum Design builder package at https://github.com/momentum-design/momentum-design/tree/main/packages/tools/builder, which favors clear, modular build stages. This work reorganizes and consolidates files and naming only, without changing algorithms or pipeline behavior.

---

## Goals & success criteria

- Introduce a dedicated `build-pipeline` directory at the repository root that holds the stroked-icon conversion stages as clearly named modules; satisfied when the tree exists, `build-pipeline` type-checks and builds on its own, and **no files under `server/` are removed or edited** as part of this work (the app continues to use the existing `server/src` pipeline until a follow-up change).
- Make `build-pipeline` self-contained: no TypeScript in `build-pipeline` may import from `server/src` or other app layers; satisfied by static analysis or review of import graph.
- Duplicate into `build-pipeline` every static asset that pipeline code or pipeline tests require to run (for example templates and fixture SVGs), copying from `server/` where those files live today and from any other repository paths currently referenced by modules that move into `build-pipeline` (such as repo-root `resources/`); satisfied when pipeline unit tests and default template resolution use only paths inside `build-pipeline`, not sibling `server/` paths or `../resources/` for those assets.
- Eliminate sequential `phaseN` filenames under **`build-pipeline` only** (existing `server/src` may keep current names until a later migration); satisfied when a search under `build-pipeline/src` finds no `phase1.ts`–`phase5.ts`.
- Preserve behavior in the **new** package: same inputs produce byte-identical or fixture-equivalent outputs for each pipeline stage and for the renamed orchestrator versus today’s `server` implementation; satisfied when **`build-pipeline`’s Vitest suite** passes without loosening SVG assertions. **`server` tests stay as-is** (unchanged files).
- Expose the pipeline as a composable library boundary (orchestrator plus discrete steps plus shared SVG/XML helpers) with no Fastify imports inside that boundary; satisfied by code review and documented import path(s) in the root README or package metadata updated in the same change set.
- Keep HTTP concerns in `server/src` (`app.ts`, `server.ts`); for this iteration they **continue to use the existing in-server pipeline modules**; `build-pipeline` is a parallel, self-contained copy for reuse and clearer structure, not a replacement wired into the server yet.

---

## User stories

- As a maintainer, I want each conversion step in a file named for its responsibility (for example generating size variants, replicating weight tiers, applying stroke widths, converting strokes to filled outlines, merging into the square SF Symbol template), so I can open the right module without a phase cheat sheet.
- As a maintainer, I want one obvious orchestrator module for the full stroked pipeline **in `build-pipeline`**, so programmatic use and future server cutover have a single entrypoint documented beside the legacy `server/src` layout.
- As a future integrator with Momentum-style builder tooling, I want the pipeline importable without the HTTP server, so the same functions can run from another Node build entrypoint.
- As an integrator, I want `build-pipeline` to ship with its own resource files under that tree, so I can vendor or extract the folder without chasing paths into `server/` or repo-root `resources/` for templates and script fixtures.
- As a test author, I want tests associated with renamed modules by stable, descriptive paths, so failures map directly to the new layout.
- As a contributor, I want shared utilities (`xml`, affine bake, routing helpers for mixed/filled icons) grouped under predictable subpaths within the repo-root `build-pipeline` layout, so deep relative imports stay shallow and consistent.
- As a consumer of the documented programmatic API, I want orchestrator option names in **`build-pipeline`** to match the new step vocabulary (not `phase1Only` / `skipPhaseN`), with the root README documenting the **new** import path and options for programmatic use of that package, without requiring edits inside `server/` in this iteration.

---

## Out of scope / non-goals

- Changing numeric constants, JSTS usage, stroke-width lookup tables, on-disk intermediate naming inside a temp output directory, or the order of pipeline steps.
- Performance work, new SVG input categories, or web UI changes.
- Actually publishing a package to a registry or landing code inside the Momentum monorepo in this iteration (only structure and boundaries that make that feasible later).
- Selecting how Momentum will consume this code (workspace link, vendor copy, publish, or other); that choice is explicitly deferred.
- Editing legacy Python under `.archive/python-legacy` except where docs must reference new paths.
- **Removing, renaming, or editing existing source files under `server/`** (including switching `app.ts` to import `build-pipeline`); that is a **follow-up** after the duplicate package exists.

---

## Constraints & risks

- `server` uses TypeScript `moduleResolution: NodeNext` and `.js` extensions in imports; **`build-pipeline` must follow the same rules** when adapting duplicated code.
- Root README should document **`build-pipeline`** programmatic entry (new names and paths) **without** implying `server` has been rewired until a follow-up.
- Momentum builder documentation cites Node 18 and npm 8; this repo pins Node 20 in `server/package.json` engines—future integration should reconcile version policy when consumption is chosen.
- A repo-root `build-pipeline` package needs its own `package.json` and `tsconfig`; **no project-reference from `server` is required** for this iteration.
- Duplicating **source** into `build-pipeline` while **`server` keeps the originals** creates **parallel implementations** until one side is retired; mitigate with tests on `build-pipeline` and a documented policy for which tree is edited when fixing bugs (typically: fix in `server` until cutover, or sync both—team choice). Duplicated templates under `build-pipeline/resources/` versus repo-root `resources/` still need the drift mitigation from the prior bullet.

---

## Decisions

- `build-pipeline` lives at the repository root (not under `server/src`).
- Orchestrator option keys are renamed to align with the new step names **in `build-pipeline`**; root README documents that API. **`server` call sites stay unchanged** in this iteration (they keep existing option names in local `pipeline.ts`).
- **Duplicate, do not move:** populate `build-pipeline` by copying from `server/src` (and resources as specified); **do not delete or edit** existing files under `server/` for this initiative.
- How Momentum will consume this code is left for a later decision; this PRD only requires a layout and boundaries that do not block that choice later.
- `build-pipeline` is self-contained: pipeline TypeScript does not import `server`; static assets needed by the pipeline or its tests are duplicated from `server/` (when present there) and from other current load paths into `build-pipeline` so scripts do not depend on reading those external locations for those files.

---

## Open questions

- None blocking this refactor; Momentum consumption mechanism remains intentionally unspecified until a follow-on initiative.
