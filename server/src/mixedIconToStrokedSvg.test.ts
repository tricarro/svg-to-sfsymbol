import { describe, expect, it } from "vitest";
import { parseSvgXml, svgDocumentElement } from "./xml.js";
import { representativeStrokeStyleForMixedPreprocess } from "./svgStrokeDetection.js";
import { mixedIconToStrokedSvg } from "./mixedIconToStrokedSvg.js";
import { FILL_OFFSET_ATTR } from "./phase4.js";
import { SOURCE_STROKE_WIDTH_ATTR } from "./phase1.js";

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
  it("emits fill-offset paths with representative stroke width for fill-only shapes", () => {
    const xml =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
      `<path d="M4 12h16" stroke="#00f" stroke-width="2" fill="none"/>` +
      `<circle cx="12" cy="12" r="4" fill="red"/>` +
      `<path d="M2 2h4" stroke="#000" stroke-width="6" fill="none"/>` +
      `</svg>`;
    const out = mixedIconToStrokedSvg(xml);
    expect(out).toMatch(
      new RegExp(
        `<path ${FILL_OFFSET_ATTR}="1" ${SOURCE_STROKE_WIDTH_ATTR}="6" fill="#00f"[^>]*stroke="#00f"[^>]*stroke-width="6"`
      )
    );
    expect(out).not.toContain("<circle");
  });

  it("stroke+fill emits an unmodified fill-only clone, then the stroke-only clone", () => {
    const xml =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
      `<path d="M0 0h4" stroke="#f00" stroke-width="8" fill="none"/>` +
      `<rect x="4" y="4" width="8" height="8" fill="yellow" stroke="black" stroke-width="2"/>` +
      `</svg>`;
    const out = mixedIconToStrokedSvg(xml);
    expect(out).not.toContain(FILL_OFFSET_ATTR);
    const rects = out.match(/<rect[^>]*>/g) ?? [];
    expect(rects).toHaveLength(2);
    expect(rects[0]).toContain('fill="yellow"');
    expect(rects[0]).not.toContain("stroke");
    expect(rects[1]).toContain('stroke="black"');
    expect(rects[1]).toContain('fill="none"');
  });

  it("merges overlapping fill-only shapes into one offset path", () => {
    const xml =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
      `<path d="M0 0h4" stroke="#f00" stroke-width="2" fill="none"/>` +
      `<path d="M4 4h10v10H4z" fill="#000"/>` +
      `<path d="M3 3h12v12H3zM4 4v10h10V4z" fill="#000" fill-rule="evenodd"/>` +
      `</svg>`;
    const out = mixedIconToStrokedSvg(xml);
    expect(out.split(`${FILL_OFFSET_ATTR}="1"`).length - 1).toBe(1);
    expect(out).not.toContain('fill-rule="evenodd"');
  });

  it("keeps holes in filled shapes (evenodd ring)", () => {
    const xml =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
      `<path d="M2 2h4" stroke="#000" stroke-width="2" fill="none"/>` +
      `<path fill-rule="evenodd" fill="#000" d="M4 4H20V20H4Z M8 8H16V16H8Z"/>` +
      `</svg>`;
    const out = mixedIconToStrokedSvg(xml);
    const m = new RegExp(`<path ${FILL_OFFSET_ATTR}="1"[^>]*>`).exec(out);
    expect(m).toBeTruthy();
    expect(m![0]).toContain('fill-rule="evenodd"');
    expect(m![0].match(/M /g)?.length).toBe(2);
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
