import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeFilledIconIntoVariableTemplate } from "./variableTemplateFilled.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const variableTemplatePath = join(repoRoot, "resources", "square_variable_template.svg");

describe("mergeFilledIconIntoVariableTemplate", () => {
  it("merges fill-only icon into three S slots and removes wireframes", () => {
    if (!existsSync(variableTemplatePath)) return;

    const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="black"/></svg>`;
    const buf = mergeFilledIconIntoVariableTemplate(icon, { templatePath: variableTemplatePath });
    const out = buf.toString("utf-8");

    expect(out).toContain('id="Ultralight-S"');
    expect(out).toContain('id="Regular-S"');
    expect(out).toContain('id="Black-S"');
    expect(out).toContain("circle");
    expect(out).not.toMatch(/<path[^>]*class="[^"]*SFSymbolsPreviewWireframe/);
  });
});
