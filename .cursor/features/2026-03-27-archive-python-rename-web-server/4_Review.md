# Code review: Filled-icon detection and variable-template conversion

**Reviewing:** Filled-icon detection and variable-template conversion (auto-routing on `POST /api/convert`, filled branch into `square_variable_template.svg`).

**What was built:** The server classifies each upload SVG as stroked vs filled using a DOM walk and stroke heuristics, then either runs the existing `runFullConvert` pipeline or merges normalized 112×112 artwork into the three Small slots of the variable SF Symbol template, returning distinct download filenames. Supporting modules are `svgStrokeDetection.ts`, `variableTemplateFilled.ts`, and branching in `convertSync` (`app.ts`).

**Inputs available:** PRD yes · Plan yes · Implementation summary yes · Code yes (`svgStrokeDetection.ts`, `variableTemplateFilled.ts`, `app.ts`, related tests).

**Starting review now.**

---

## Findings (by severity)

### Critical

(None.)

### Major

```
[Major] Plan alignment — Line / polyline / polygon stroke semantics not as specified
File: server/src/svgStrokeDetection.ts (elementHasVisibleStroke, GRAPHICAL_TAGS)
Issue: The plan called out explicit handling for line, polyline, and polygon (visible stroke when fill absent or stroke present per rules). The implementation only marks an element as stroked when a non-none stroke color is present on that element. SVG lines and polylines are often authored with no `stroke` attribute but default visible stroke in viewers; those inputs classify as `filled` and are sent through the variable template path, which contradicts the planned detection rule and can produce wrong pipeline choice for real-world icons.
```

```
[Major] Plan alignment — Missing planned test case for `<line>`
File: server/src/svgStrokeDetection.test.ts
Issue: Phase 1 of the plan listed a Vitest case for a `line` element; no test targets `line` (or `polyline` / `polygon`) classification. That leaves the deviation above undetected in CI.
```

```
[Major] Test coverage — Fill-only path not exercised via HTTP inject
File: server/src/app.test.ts
Issue: `convertSync` is tested for the filled branch, but `POST /api/convert` tests only cover stroked SVG success. A regression in multipart handling, headers, or error mapping specific to the filled branch would not be caught by the API test suite.
```

```
[Major] Plan / risk — Template contract not guarded by a structural test
File: server/src/variableTemplateFilled.test.ts (and plan “Template drift” note)
Issue: The plan suggested a test that fails if expected `Symbols` children or slot ids are missing. Current tests only assert substrings in merged output; a template file that still serializes but omits or renames slots could yield incomplete merges without failing tests until manual inspection.
```

### Minor

```
[Minor] PRD / product copy — “Agreed fixture set” not represented in repo
File: tests vs PRD goals (success criteria)
Issue: The PRD ties success to spot-checks against a small agreed fixture set (stroked-only, fill-only, stroke-only with fill none). The tests cover several cases but are not framed or documented as that fixture set; regression interpretation is left implicit.
```

```
[Minor] Error taxonomy — Parse failures likely surface as 500
File: server/src/app.ts (catch block), server/src/xml.ts / classify / merge call chain
Issue: Invalid XML or “Root element must be svg” from `parseSvgXml` becomes a generic 500 `detail` unless the message accidentally matches other branches. The PRD asked for responses consistent with today’s API; invalid uploads may be more accurately described as 400-level client errors.
```

```
[Minor] HTTP error routing — Broad substring for 503
File: server/src/app.ts (lines 136–142)
Issue: Conditions use `msg.includes("No SF Symbol")`, which matches both square- and variable-template messages and any future error text that contains that phrase. Unrelated internal errors that embed the same substring could be classified as 503.
```

```
[Minor] Code quality — Duplicated template-slot geometry logic
File: server/src/variableTemplateFilled.ts vs server/src/phase5.ts
Issue: `pathBBoxFromD`, wireframe class checks, defs merge, and Symbols discovery duplicate `phase5` logic. This was noted in the implementation summary as an allowed deviation but increases drift risk when one path is fixed and the other is not.
```

```
[Minor] Performance — Double parse of upload XML on filled path
File: server/src/app.ts, server/src/variableTemplateFilled.ts
Issue: `classifySvgStrokedOrFilled` parses the string; `mergeFilledIconIntoVariableTemplate` parses again. For large SVGs this is redundant work on a hot path (mitigated somewhat by upload size cap).
```

### Suggestion

```
[Suggestion] Detection coverage — `<use>` and additional graphical tags
File: server/src/svgStrokeDetection.ts
Issue: `use`, `image`, and other graphical containers are not traversed for instantiated geometry; strokes applied only on referenced content may misclassify. The PRD already flags `<use>` as a heuristic limit; extending the tag set or documenting excluded tags in-module would narrow the gap between stated limitations and code behavior.
```

```
[Suggestion] Security / XML — Parser hardening scope unchanged
File: server/src/xml.ts (shared)
Issue: DOCTYPE stripping is applied; other XML bomb or expansion risks depend on `@xmldom/xmldom` behavior and upload size limits. No new vulnerability specific to this feature was identified; this is a reminder that classification and merge add another parse pass on untrusted input.
```

---

## Checklist notes (areas with no additional findings)

- **[PRD alignment]** — Core goals (auto branch, stroked path unchanged, filled path into variable template without overwriting file, hyphen naming, translate-only placement after 112 normalization, mixed geometry not a separate mode) are reflected in code. The line/polyline behavior vs plan is flagged under Major.
- **[Plan alignment]** — Optional `phase5` helper export was not done (documented). Deferrable README/comment polish may be partially satisfied via README. Other deviations noted above.
- **[Code quality]** — Naming and module boundaries match the existing server layout; no dead code or debug logging observed in reviewed files.
- **[Edge cases]** — Empty file and extension checks remain in `convertSync` / route; filled branch does not pre-check square template presence (appropriate). Very empty valid SVG → filled → merge behavior not deeply validated in tests.
- **[Security]** — No hardcoded secrets; filenames sanitized via `safeStem`; SVG body not logged in the reviewed path. Injection via `Content-Disposition` is limited by stem rules.
- **[Performance]** — Dominated by full pipeline for stroked path; filled path is lighter aside from double parse (Minor).
- **[Accessibility]** — Not applicable: no UI surface changed in reviewed server code.

---

## Review summary

**Total issues:** 0 Critical · 4 Major · 5 Minor · 2 Suggestion

**Overall assessment:** The implementation delivers the main branching behavior and variable-template merge with tests for classification and `convertSync` filled output. The largest gaps are **plan fidelity for line-like primitives**, **incomplete Phase 1 test checklist**, **missing HTTP coverage for the filled branch**, and **no explicit guard on template slot structure**. Error status codes and 503 substring matching are rough edges worth tightening before treating the API as stable.

---

**Review complete.**

Please address any issues you intend to fix, then confirm when ready to proceed:

- [ ] All Critical issues resolved (or explicitly accepted with rationale)
- [ ] Major issues triaged — fix, defer, or accept each one
- [ ] Minor issues and suggestions reviewed

Reply **"approved"** to move to `/document`, or tell me which issues you've addressed so I can note them.
