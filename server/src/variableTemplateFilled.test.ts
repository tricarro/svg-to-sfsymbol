import { describe, expect, it } from "vitest";
import { XMLSerializer } from "@xmldom/xmldom";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeFilledIconIntoVariableTemplate } from "./variableTemplateFilled.js";
import {
  parseSvgXml,
  elementChildren,
  localTag,
  svgDocumentElement,
  type SvgElement,
} from "./xml.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const variableTemplatePath = join(repoRoot, "resources", "square_variable_template.svg");

function slotContentGroupById(svgXml: string, slotId: string): string | null {
  const doc = parseSvgXml(svgXml);
  const root = svgDocumentElement(doc);
  const walk = (el: SvgElement): SvgElement | null => {
    if (localTag(el) === "g" && el.getAttribute("id") === slotId) return el;
    for (const c of elementChildren(el)) {
      const f = walk(c);
      if (f) return f;
    }
    return null;
  };
  const slot = walk(root);
  if (!slot) return null;
  const kids = elementChildren(slot);
  const withTransform = kids.filter((c) => localTag(c) === "g" && c.getAttribute("transform")?.startsWith("translate("));
  if (withTransform.length !== 1) return null;
  const g = withTransform[0];
  return new XMLSerializer().serializeToString(g);
}

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

  it("applies erode filter to Ultralight-S, dilate to Black-S, none on Regular-S", () => {
    if (!existsSync(variableTemplatePath)) return;

    const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="black"/></svg>`;
    const out = mergeFilledIconIntoVariableTemplate(icon, { templatePath: variableTemplatePath }).toString("utf-8");

    expect(out).toContain('id="svg2sfsym-morph-ultralight"');
    expect(out).toContain('id="svg2sfsym-morph-black"');
    expect(out).toMatch(/<feMorphology[^>]*operator="erode"/);
    expect(out).toMatch(/<feMorphology[^>]*operator="dilate"/);

    const ultra = slotContentGroupById(out, "Ultralight-S");
    const regular = slotContentGroupById(out, "Regular-S");
    const black = slotContentGroupById(out, "Black-S");
    expect(ultra).toBeTruthy();
    expect(regular).toBeTruthy();
    expect(black).toBeTruthy();
    expect(ultra).toContain('filter="url(#svg2sfsym-morph-ultralight)"');
    expect(black).toContain('filter="url(#svg2sfsym-morph-black)"');
    expect(regular).not.toContain("filter=");

    expect(ultra).toMatch(/scale\(/);
    expect(black).toMatch(/scale\(/);
    expect(regular).not.toMatch(/scale\(/);
  });
});
