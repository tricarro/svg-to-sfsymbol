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

function slotPathDs(svgXml: string, slotId: string): string[] {
  const g = slotContentGroupById(svgXml, slotId);
  if (!g) return [];
  return [...g.matchAll(/ d="([^"]*)"/g)].map((m) => m[1]);
}

function xExtent(ds: string[]): number {
  const xs = ds.flatMap((d) =>
    [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => parseFloat(m[1]))
  );
  return Math.max(...xs) - Math.min(...xs);
}

const commandSignature = (ds: string[]) => ds.map((d) => d.replace(/[^A-Za-z]/g, ""));

describe("mergeFilledIconIntoVariableTemplate", () => {
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="black"/></svg>`;

  it("merges fill-only icon into three S slots as paths and removes wireframes", () => {
    if (!existsSync(variableTemplatePath)) return;
    const out = mergeFilledIconIntoVariableTemplate(icon, { templatePath: variableTemplatePath }).toString("utf-8");

    for (const id of ["Ultralight-S", "Regular-S", "Black-S"]) {
      expect(slotPathDs(out, id)).toHaveLength(1);
    }
    expect(out).not.toContain("<circle");
    expect(out).not.toMatch(/<path[^>]*class="[^"]*SFSymbolsPreviewWireframe/);
  });

  it("builds weights from real outline offsets with interpolation-compatible structure", () => {
    if (!existsSync(variableTemplatePath)) return;
    const out = mergeFilledIconIntoVariableTemplate(icon, { templatePath: variableTemplatePath }).toString("utf-8");

    expect(out).not.toContain("<filter");
    expect(out).not.toContain("filter=");
    expect(out).not.toMatch(/scale\(/);

    const ultra = slotPathDs(out, "Ultralight-S");
    const regular = slotPathDs(out, "Regular-S");
    const black = slotPathDs(out, "Black-S");
    expect(commandSignature(ultra)).toEqual(commandSignature(regular));
    expect(commandSignature(black)).toEqual(commandSignature(regular));
    expect(xExtent(ultra)).toBeLessThan(xExtent(regular));
    expect(xExtent(black)).toBeGreaterThan(xExtent(regular));
  });

  it("writes margin guides around each slot's artwork", () => {
    if (!existsSync(variableTemplatePath)) return;
    const out = mergeFilledIconIntoVariableTemplate(icon, { templatePath: variableTemplatePath }).toString("utf-8");
    for (const id of ["Ultralight-S", "Regular-S", "Black-S"]) {
      expect(out.match(new RegExp(`id="left-margin-${id}"`, "g"))).toHaveLength(1);
      expect(out.match(new RegExp(`id="right-margin-${id}"`, "g"))).toHaveLength(1);
    }
  });

  it("drops shapes with no visible fill", () => {
    if (!existsSync(variableTemplatePath)) return;
    const withHidden =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">` +
      `<rect width="24" height="24"/>` +
      `<circle cx="12" cy="12" r="8" fill="black"/></svg>`;
    const out = mergeFilledIconIntoVariableTemplate(withHidden, { templatePath: variableTemplatePath }).toString("utf-8");
    expect(slotPathDs(out, "Regular-S")).toHaveLength(1);
  });
});
