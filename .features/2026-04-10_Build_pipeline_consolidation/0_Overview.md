# Overview: Build pipeline consolidation

**Date completed:** 2026-04-10  
**Cycle artifacts:** `0_Overview.md`, `1_ProductRequirementsDocument.md`, `2_Plan.md`, `3_Implementation.md` — no `4_Review.md` (formal review skill was not run) 

---

## What was built and why

The SVG → SF Symbol conversion logic lived under `server/src` with `phase1`–`phase5` filenames, which obscured what each step does and made reuse in other build tools (for example Momentum-style pipelines) harder. This cycle added a **duplicate, self-contained package** at **`build-pipeline/`** with descriptive modules (`sizeVariants`, `weightReplicas`, `strokeWidths`, `strokeToOutline`, `squareTemplateMerge`) and a renamed **`runFullConvert`** option surface. The **Fastify server was not switched** to that package: it still runs the original `server/src` pipeline so behavior of the web app is unchanged. Templates used by the new package are copied under **`build-pipeline/resources/`** so the tree can be vendored or tested without reading repo-root `resources/` for those defaults.

---

## How it works

- **`build-pipeline/src/steps/`** — five sequential stages plus **`runFullConvert.ts`** orchestration at package root; **`src/svg/`** holds XML I/O and affine bake (`buildSizeVariantBakeMatrix` replaces the old phase-1 bake name).
- **`src/routing/svgRouting.ts`**, **`src/preprocess/mixedToStrokedSvg.ts`**, **`src/filled/`** mirror the server’s classification, mixed preprocessing, and variable-template merge paths.
- **`src/index.ts`** re-exports the public API; consumers run **`npm run build`** and import from **`dist/`** or depend on the workspace package.
- Root **`package.json`** defines **workspaces** (`server`, `build-pipeline`) and **`npm test`** runs Vitest in both packages. **`README.md`** documents both programmatic entrypoints (server vs `build-pipeline`).

---

## What was explicitly left out

- Rewiring **`server`** to import **`build-pipeline`** or deleting duplicate **`server/src`** pipeline files (deferred follow-up).
- Choosing how **Momentum** or other monorepos will consume the package (explicitly deferred in the PRD).
- Publishing **`build-pipeline`** to a registry.
- **`4_Review.md`** — no cold-read review artifact was produced this cycle.

---

## Known limitations & gotchas

- **Two sources of truth** until cutover: fixes to conversion logic should be applied in both **`server/src`** and **`build-pipeline/src`**, and template edits may need to stay in sync between repo-root **`resources/`** and **`build-pipeline/resources/`** (see **`build-pipeline/README.md`**).
- **`calendar-today.svg`** is not in **`build-pipeline/resources/`**; the stroke-to-outline calendar integration test **skips** if that fixture is absent.
- During implementation, **`mixedIconToStrokedSvg.test.ts`** on the server was updated (assertions only) to match current boundary-path markup; that is a small deviation from “zero server diffs” for the duplicate-only plan.

---

## Review findings & resolutions

No **`/review`** run — no formal severity-ranked findings document. Implementation notes and test fixes are recorded in **`3_Implementation.md`**.

---

## Files touched

See **`3_Implementation.md`** for the authoritative list: new **`build-pipeline/**`**, root **`package.json`** / **`package-lock.json`**, root **`README.md`**, **`server/src/mixedIconToStrokedSvg.test.ts`**, and git restores for missing **`server/src`** files noted there.
