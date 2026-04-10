import { describe, expect, it } from "vitest";
import { mixedIconToFillOnlySvg } from "./mixedIconToFilled.js";

describe("mixedIconToFillOnlySvg", () => {
  it("unions filled circle with stroked horizontal line into one path", () => {
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="6" fill="#00f"/>
      <line x1="2" y1="12" x2="22" y2="12" stroke="#000" stroke-width="2"/>
    </svg>`;
    const out = mixedIconToFillOnlySvg(xml);
    expect(out).toContain('viewBox="0 0 24 24"');
    expect(out).toContain('fill="#000000"');
    expect(out).toMatch(/<path[^>]+d="[^"]+"/);
    expect(out).not.toContain("stroke=");
  });

  it("handles stroke+fill on one path", () => {
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <path d="M16 4 L28 28 L4 28 Z" fill="#ccc" stroke="#000" stroke-width="2"/>
    </svg>`;
    const out = mixedIconToFillOnlySvg(xml);
    expect(out).toContain("fill=\"#000000\"");
    expect(out).toMatch(/d="M/);
  });

  it("throws when nothing to union", () => {
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g/></svg>`;
    expect(() => mixedIconToFillOnlySvg(xml)).toThrow(/no geometry/);
  });
});
