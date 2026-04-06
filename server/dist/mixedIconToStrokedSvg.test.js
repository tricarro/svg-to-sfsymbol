import { describe, expect, it } from "vitest";
import { parseSvgXml, svgDocumentElement } from "./xml.js";
import { representativeStrokeStyleForMixedPreprocess } from "./svgStrokeDetection.js";
import { mixedIconToStrokedSvg } from "./mixedIconToStrokedSvg.js";
describe("representativeStrokeStyleForMixedPreprocess", () => {
    it("uses max stroke-width and first stroke color in document order", () => {
        const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
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
        const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
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
    it("retains fill and stroke on stroke+fill shape without extra boundary path", () => {
        const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
            `<rect x="4" y="4" width="8" height="8" fill="yellow" stroke="black" stroke-width="2"/>` +
            `</svg>`;
        const out = mixedIconToStrokedSvg(xml);
        expect(out).toContain('stroke="black"');
        expect(out).toContain('stroke-width="2"');
        expect(out.match(/<rect[^>]*>/g)?.[0]).toMatch(/fill="yellow"/);
        expect(out.match(/<path\b/g) ?? []).toHaveLength(0);
    });
});
