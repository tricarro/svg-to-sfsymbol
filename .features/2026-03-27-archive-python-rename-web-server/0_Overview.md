# Overview: FilledShapeHandling — filled-icon detection and variable SF Symbol template

**Date completed:** 2026-03-28  
**Cycle artifacts:** `0_Overview.md` (this file), `1_ProductRequirementsDocument.md`, `2_Plan.md`, `3_Implementation.md`, `4_Review.md`, `README.md` (cycle stub)

---

## What was built and why

The converter originally assumed **stroked** icons and ran them through a multi-phase pipeline into the full **square** SF Symbol template. **Fill-only** artwork is a poor fit for that path. This cycle adds **automatic routing**: the server inspects each upload for a visible stroke (simple heuristics on the DOM), sends **stroked** files through the existing pipeline, and sends **filled** files through a new path that scales the icon to a **112×112** frame and places it in **`Ultralight-S`**, **`Regular-S`**, and **`Black-S`** inside **`resources/square_variable_template.svg`**, without ever overwriting that template on disk. Downloads keep the familiar flow; filenames differ by branch (`*_SFSymbol.svg` vs `*-SFSymbol.svg`). Follow-up tweaks improved **error visibility** in the web UI (read response body when JSON parsing fails) and mapped common **SVG sizing** mistakes to **400** with a clear message.

---

## How it works

- **`server/src/svgStrokeDetection.ts`** — Parses SVG (DOCTYPE stripped via shared `xml.ts`), walks elements outside **`defs`**, and classifies **`stroked`** vs **`filled`** from presentation attributes and basic inline **`style`** for stroke/stroke-width.
- **`server/src/variableTemplateFilled.ts`** — Resolves **`resources/square_variable_template.svg`** or **`SFSYMBOL_VARIABLE_TEMPLATE_PATH`**, reuses **`buildVariantSvg(..., 112)`** from **`phase1.ts`**, merges **`defs`**, then for each of the three slot groups removes the **`SFSymbolsPreviewWireframe`** path and inserts a **`translate`-only** wrapper with the normalized artwork (same centering idea as **`phase5`**).
- **`server/src/app.ts`** — **`convertSync`** branches after classification; **`POST /api/convert`** unchanged for clients. Template-missing errors use **503**; several validation strings map to **400**.
- **`web/src/main.ts`** — On failed convert, reads **`res.text()`** and surfaces **`detail`** or a text snippet so users do not only see generic HTTP status text.
- **Docs:** Root **`README.md`** describes both templates, env vars, routing, and the **viewBox / numeric width-height** requirement.

---

## What was explicitly left out

- **Mixed geometry** (stroke + fill semantics in one deliberate product mode) — per PRD; future work.
- **Extra weights/scales** beyond the three groups in the variable template file.
- **Manual UI toggle** between pipelines.
- **Shared `pathBBoxFromD` extraction** from **`phase5.ts`** — deferred in favor of a self-contained variable-template module (duplication accepted).
- **Review Major items** — Line/polyline default-stroke detection, dedicated **`<line>`** tests, **HTTP inject** for fill-only success, and structural **template slot** contract tests were **not implemented** in this wrap-up; they remain backlog unless revisited.

---

## Known limitations & gotchas

- **Heuristic classification** — Ignores **`<use>`** expansion, **`display:none`**, and rich CSS; may misroute some files.
- **Dev setup** — Vite proxies **`/api`** to **`127.0.0.1:3000`**. If only **`npm run dev`** runs under **`web/`**, you get **ECONNREFUSED** until **`cd server && npm run dev`** (or equivalent) is running.
- **SVG root** — Needs **`viewBox`** or numeric **`width`/`height`** (not percentages); otherwise conversion errors (now **400** where mapped).
- **Variable template** — Apple file shape is assumed (slot ids, wireframe class); drift would break merge behavior before tests might catch structural regressions.

---

## Review findings & resolutions

- **Critical:** none.
- **Major / Minor / Suggestions:** Documented in **`4_Review.md`**. For this close-out: **no further code changes** were required for the user-declared successful outcome; line/polyline semantics, extra tests, narrower **503** substring matching, and deduping **`phase5`** geometry helpers remain **open** for a future pass.
- **Operational:** Improved client error display and **400** mapping for common SVG root / path bake failures address the spirit of review **Minor** items on error taxonomy for those specific messages.

---

## Files touched

**From implementation summary (core feature):**

- `server/src/svgStrokeDetection.ts`, `server/src/svgStrokeDetection.test.ts`
- `server/src/variableTemplateFilled.ts`, `server/src/variableTemplateFilled.test.ts`
- `server/src/app.ts`, `server/src/app.test.ts`
- `README.md`

**Follow-up (errors / UX):**

- `web/src/main.ts` — error response body handling for failed **`/api/convert`**
- `server/src/app.ts` — additional **400** branches for viewBox / root / unparseable path messages
- `README.md` — viewBox tip (if not already folded into earlier edit)
