# Implementation plan: Build pipeline consolidation

Status: Draft  
PRD: `.features/current/1_ProductRequirementsDocument.md`  
Date: 2026-04-10  

---

## Overview

Add a new **repo-root `build-pipeline/` package** by **duplicating** (not moving) conversion and SVG-processing logic from `server/src`, with descriptive module names (no `phase1`–`phase5` filenames under `build-pipeline`). **Do not delete or edit any existing files under `server/`**—the Fastify app keeps using today’s `server/src` pipeline unchanged. **Behavior and SVG outputs** of the new package must match the current server implementation: duplicate code, adjust imports **only inside `build-pipeline`**, copy static assets into `build-pipeline/resources/`, rename the orchestrator option bag and result fields **in `build-pipeline`**, and document the new package in the root README. End state: **`build-pipeline` passes its own `npm test` and `npm run build`**; **`cd server && npm test` and server dev/build behave exactly as before** (no server file diffs for source).

---

## Architecture decisions

### Monorepo wiring (optional for this iteration)

A **root `package.json`** with `"workspaces": ["server", "build-pipeline"]` is **optional** but useful so one `npm install` at the repo root installs both packages. **`server/package.json` is not modified** to depend on `build-pipeline` until a follow-up. **`build-pipeline` is standalone**: consumers import it by path or future workspace dep.

### TypeScript

**`build-pipeline/tsconfig.json`** uses **`composite`** if you want project references later; **do not add** a `references` entry in `server/tsconfig.json` in this iteration. Match **`NodeNext`** and **`.js` extensions** in imports like `server`.

### Self-contained package boundary

All duplicated modules live under **`build-pipeline/src`**. **No import from `server/` into `build-pipeline`**. **Fastify** remains only in `server`. Static files for **`build-pipeline` tests and default template resolution** live in **`build-pipeline/resources/`** (copies). Path helpers resolve templates **relative to the `build-pipeline` package root**.

### Authoritative copies vs repo-root `resources/`

**`build-pipeline` tests and defaults** use **`build-pipeline/resources/`** only. **Repo-root `resources/`** stays as today for the running server. Document in **`build-pipeline/README.md`** that two **source** trees (`server/src` vs `build-pipeline/src`) and two **template** locations exist until cutover—edits to conversion logic require a conscious sync policy.

### Public API shape (build-pipeline only)

Rename option keys, `FullConvertResult` fields, step exports, and constants **only in `build-pipeline`** (tables below). **`server/src/pipeline.ts` and friends stay unchanged.**

---

## File & folder changes

| Action | Path | Notes |
|--------|------|-------|
| Create (optional) | `package.json` (repo root) | `private`, `workspaces`: `server`, `build-pipeline`; scripts to run `build-pipeline` tests—**does not modify `server/package.json`** |
| Create | `build-pipeline/package.json` | `name` (e.g. `build-pipeline`), `type: "module"`, deps: `@xmldom/xmldom`, `jsts`, `svgpath`; devDeps: `typescript`, `vitest`, `@types/node` |
| Create | `build-pipeline/tsconfig.json` | `composite` optional, `NodeNext`, `rootDir`/`outDir` |
| Create | `build-pipeline/vitest.config.ts` | Pipeline tests under `build-pipeline` |
| Create | `build-pipeline/resources/*.svg` | Copy templates + `calendar-today.svg` if present from repo `resources/` |
| Create | `build-pipeline/README.md` | Self-contained package; duplicate-of-server policy; drift warning |
| **Copy** | `build-pipeline/src/svg/xml.ts` | Duplicate of `server/src/xml.ts`; fix relative imports to package layout |
| **Copy** | `build-pipeline/src/svg/affineBake.ts` | Duplicate of `server/src/svgAffineBake.ts` (file rename only in copy) |
| **Copy** | `build-pipeline/src/steps/sizeVariants.ts` | From `phase1.ts` + renames |
| **Copy** | `build-pipeline/src/steps/weightReplicas.ts` | From `phase2.ts` |
| **Copy** | `build-pipeline/src/steps/strokeWidths.ts` | From `phase3.ts` |
| **Copy** | `build-pipeline/src/steps/strokeToOutline.ts` | From `phase4.ts` |
| **Copy** | `build-pipeline/src/steps/squareTemplateMerge.ts` | From `phase5.ts` |
| **Copy** | `build-pipeline/src/runFullConvert.ts` | From `pipeline.ts`; new option/result names |
| **Copy** | `build-pipeline/src/routing/svgRouting.ts` | From `svgStrokeDetection.ts` |
| **Copy** | `build-pipeline/src/preprocess/mixedToStrokedSvg.ts` | From `mixedIconToStrokedSvg.ts` |
| **Copy** | `build-pipeline/src/filled/variableTemplateMerge.ts` | From `variableTemplateFilled.ts` |
| **Copy** | `build-pipeline/src/filled/mixedIconToFilled.ts` | From `mixedIconToFilled.ts` |
| **Copy** | `build-pipeline/src/**/*.test.ts` | Duplicate tests; point fixtures at `build-pipeline/resources` |
| Create | `build-pipeline/src/index.ts` | Barrel exports |
| **No change** | `server/**` | **Do not edit or delete** any existing server source, config, or tests in this initiative |
| Modify | Root `README.md` | Add `build-pipeline/` to layout; document programmatic use **from `build-pipeline`**; clarify server still uses `server/src` until follow-up |
| Modify | `.cursor/context/*.md` | [deferrable] Path updates only |

---

## Component & interface design

### Orchestrator (`runFullConvert` in build-pipeline)

| Current (server) | New (`build-pipeline`) |
|------------------|-------------------------|
| `phase1Only` | `sizeVariantsOnly` |
| `skipPhase3` | `skipStrokeWidths` |
| `skipPhase4` | `skipStrokeToOutline` |
| `skipPhase5` | `skipSquareTemplateMerge` |
| `phase5Template` | `squareTemplatePath` |
| `phase5Out` | `mergedSvgOutputPath` |
| `phase5Missing` | `missingSlotPolicy` |
| `phase4Flatness` | `outlineFlatness` |
| `requireMergedSvg` | keep or `requireMergedOutput` |

`FullConvertResult` fields: `sizeVariantPaths`, `weightReplicaPaths`, `strokeWidthCounts`, `strokeToOutlineCounts`, `squareTemplateMergeStats` (replacing `phase*` names).

### Step exports (build-pipeline only)

`runSizeVariants`, `runWeightReplicas`, `runStrokeWidths`, `runStrokeToOutline`, `runSquareTemplateMerge`; constants `SIZE_VARIANTS`, `SF_SYMBOL_WEIGHTS`, etc.

---

## Phased task sequence

### Phase 1 — Scaffold `build-pipeline`

- [ ] Optionally add root `package.json` workspaces (`server`, `build-pipeline`) — S — **without changing `server/package.json`**
- [ ] Create `build-pipeline/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/` subfolders — S
- [ ] Copy SVGs into `build-pipeline/resources/` — S
- [ ] Add `build-pipeline/README.md` (duplicate policy, drift) — S — [deferrable] polish

### Phase 2 — Duplicate shared SVG core

- [ ] Copy `xml.ts` → `build-pipeline/src/svg/xml.ts`; wire internal imports — M
- [ ] Copy `svgAffineBake.ts` → `build-pipeline/src/svg/affineBake.ts` — M
- [ ] Run `build-pipeline` vitest smoke (empty or one trivial test) — S

### Phase 3 — Duplicate steps with renames (logic byte-for-byte aside from paths/names)

- [ ] Copy `phase1.ts` → `steps/sizeVariants.ts`; rename exports/constants — M
- [ ] Copy `phase2.ts` → `steps/weightReplicas.ts` — M
- [ ] Copy `phase3.ts` → `steps/strokeWidths.ts` — M
- [ ] Copy `phase4.ts` → `steps/strokeToOutline.ts` — L
- [ ] Copy `phase5.ts` → `steps/squareTemplateMerge.ts`; template default → `build-pipeline/resources` — M
- [ ] Copy `phase4.test.ts`; fixtures → `build-pipeline/resources` — M

### Phase 4 — Orchestrator

- [ ] Copy `pipeline.ts` → `runFullConvert.ts`; wire renamed steps/options/results — M
- [ ] Add `build-pipeline/src/index.ts` — S

### Phase 5 — Routing and filled/mixed

- [ ] Copy `svgStrokeDetection.ts` + test → `routing/svgRouting.ts` — M
- [ ] Copy `mixedIconToStrokedSvg.ts` + test — M
- [ ] Copy `variableTemplateFilled.ts` + test — M
- [ ] Copy `mixedIconToFilled.ts` + test — S

### Phase 6 — Verification (server untouched)

- [ ] `cd build-pipeline && npm test` — M
- [ ] `cd build-pipeline && npm run build` — S
- [ ] `cd server && npm test` — confirm **no server changes**; same pass/fail as baseline — S
- [ ] Grep `build-pipeline/src` for `phase[1-5]\.` filenames — should be none — S

### Phase 7 — Docs

- [ ] Update root `README.md`: new package, import path for programmatic use of **`build-pipeline`**, note server still uses `server/src` — M
- [ ] Update internal context docs — S — [deferrable]

**Complexity key:** S = under an hour / M = half day / L = full day or more

---

## Risk flags & open technical questions

- **Dual implementation drift:** Bug fixes in `server` will not apply to `build-pipeline` until someone ports them. Document in README; follow-up issue to **switch server to import `build-pipeline`** or delete duplicate.
- **Duplicate `resources/`:** Same as before—templates in two places; document sync.
- **`import.meta.url`:** Defaults must resolve from `build-pipeline` build output to `build-pipeline/resources`.
- **Root workspace without server dep:** `npm install` from root may still hoist correctly; if not, `cd build-pipeline && npm install` remains valid.

---

## Out of scope

Per PRD: any **edit or delete** under `server/`; algorithm changes; web UI; npm publish; Momentum wiring; Python archive.

---

## Follow-up (not this plan)

- Wire `server` to import `build-pipeline`, then remove duplicate `server/src` pipeline modules, **or** keep server as thin HTTP and delete duplicate—product decision.
