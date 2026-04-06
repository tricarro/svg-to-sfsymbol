import { describe, expect, it } from "vitest";
import { parseSvgXml, svgDocumentElement } from "./xml.js";
import { representativeStrokeStyleForMixedPreprocess } from "./svgStrokeDetection.js";
import { mixedIconToStrokedSvg } from "./mixedIconToStrokedSvg.js";

describe("representativeStrokeStyleForMixedPreprocess", () => {
  it("uses max stroke-width and first stroke color in document order", () => {
    const xml =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
      `<path d="M4 12h16" stroke="#00f" stroke-width="2" fill="none"/>` +
      `<circle cx="12" cy="12" r="4" fill="red"/>` +
      `<path d="M2 2h4" stroke="#000" stroke-width="6" fill="none"/>` +
      `</svg>`;
    const root = svgDocumentElement(parseSvgXml(xml));
    const { width, color } = representativeStrokeStyleForMixedPreprocess(root);
    expect(width).toBe(6);
    expect(color).toBe("#00f");
  });
});

describe("mixedIconToStrokedSvg", () => {
  it("emits stroked boundary paths with representative width for fill-only shapes", () => {
    const xml =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
      `<path d="M4 12h16" stroke="#00f" stroke-width="2" fill="none"/>` +
      `<circle cx="12" cy="12" r="4" fill="red"/>` +
      `<path d="M2 2h4" stroke="#000" stroke-width="6" fill="none"/>` +
      `</svg>`;
    const out = mixedIconToStrokedSvg(xml);
    expect(out).toContain('stroke-width="6"');
    expect(out).toContain('stroke="#00f"');
    expect(out).toContain('fill="none"');
    expect(out).toMatch(/fill="none"[^>]*stroke-linecap="round"/);
  });

  it("stroke+fill emits fill-only, boundary path (rep stroke), then stroke-only in order", () => {
    const xml =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
      `<path d="M0 0h4" stroke="#f00" stroke-width="8" fill="none"/>` +
      `<rect x="4" y="4" width="8" height="8" fill="yellow" stroke="black" stroke-width="2"/>` +
      `</svg>`;
    const out = mixedIconToStrokedSvg(xml);
    const iFillLayer = out.indexOf('fill="yellow"');
    const iBoundaryPath = out.indexOf('<path fill="none"');
    const iStrokeLayer = out.indexOf('stroke="black"');
    expect(iFillLayer).toBeGreaterThan(-1);
    expect(iBoundaryPath).toBeGreaterThan(-1);
    expect(iStrokeLayer).toBeGreaterThan(-1);
    expect(iFillLayer).toBeLessThan(iBoundaryPath);
    expect(iBoundaryPath).toBeLessThan(iStrokeLayer);
    expect(out.slice(iBoundaryPath, iBoundaryPath + 200)).toContain('stroke="#f00"');
    expect(out.slice(iBoundaryPath, iBoundaryPath + 200)).toContain('stroke-width="8"');
    const rects = out.match(/<rect[^>]*>/g) ?? [];
    expect(rects.some((r) => r.includes('fill="yellow"') && !r.includes('stroke="black"'))).toBe(true);
    expect(rects.some((r) => r.includes('stroke="black"') && !r.includes('fill="yellow"'))).toBe(true);
  });

  it("stroke+fill text emits fill-only then stroke-only without synthetic boundary path", () => {
    const xml =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
      `<text x="2" y="12" fill="red" stroke="blue" stroke-width="1">X</text>` +
      `</svg>`;
    const out = mixedIconToStrokedSvg(xml);
    expect(out).not.toMatch(/<path[^>]*fill="none"[^>]*stroke-linecap="round"/);
    expect(out.indexOf('fill="red"')).toBeLessThan(out.indexOf('stroke="blue"'));
    expect(out.match(/<text\b/g)?.length).toBe(2);
  });
});
