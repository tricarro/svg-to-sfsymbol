import { describe, expect, it } from "vitest";
import { classifySvgStrokedOrFilled, elementHasVisibleStroke } from "./svgStrokeDetection.js";
import { parseSvgString } from "./phase1.js";

describe("elementHasVisibleStroke", () => {
  it("false when stroke missing", () => {
    const el = parseSvgString(
      `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10H0z" fill="black"/></svg>`
    );
    const path = el.getElementsByTagName("path")[0] as import("@xmldom/xmldom").Element;
    expect(elementHasVisibleStroke(path)).toBe(false);
  });

  it("true when stroke and width set", () => {
    const el = parseSvgString(
      `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10" stroke="black" stroke-width="2" fill="none"/></svg>`
    );
    const path = el.getElementsByTagName("path")[0] as import("@xmldom/xmldom").Element;
    expect(elementHasVisibleStroke(path)).toBe(true);
  });

  it("false for stroke none", () => {
    const el = parseSvgString(
      `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10" stroke="none" stroke-width="2" fill="red"/></svg>`
    );
    const path = el.getElementsByTagName("path")[0] as import("@xmldom/xmldom").Element;
    expect(elementHasVisibleStroke(path)).toBe(false);
  });

  it("false for stroke-width 0", () => {
    const el = parseSvgString(
      `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10" stroke="black" stroke-width="0" fill="none"/></svg>`
    );
    const path = el.getElementsByTagName("path")[0] as import("@xmldom/xmldom").Element;
    expect(elementHasVisibleStroke(path)).toBe(false);
  });
});

describe("classifySvgStrokedOrFilled", () => {
  it("stroked for stroked path", () => {
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 12h16" stroke="black" stroke-width="2" fill="none"/></svg>`;
    expect(classifySvgStrokedOrFilled(xml)).toBe("stroked");
  });

  it("filled for fill-only path", () => {
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 4 L20 20 L4 20 Z" fill="currentColor"/></svg>`;
    expect(classifySvgStrokedOrFilled(xml)).toBe("filled");
  });

  it("stroked when stroke only in style", () => {
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0 L10 10" style="stroke:red;stroke-width:1px" fill="none"/></svg>`;
    expect(classifySvgStrokedOrFilled(xml)).toBe("stroked");
  });

  it("ignores stroke inside defs", () => {
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><path id="p" d="M0 0h5" stroke="black" stroke-width="2"/></defs><use href="#p"/></svg>`;
    expect(classifySvgStrokedOrFilled(xml)).toBe("filled");
  });

  it("filled for circle with fill only", () => {
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#333"/></svg>`;
    expect(classifySvgStrokedOrFilled(xml)).toBe("filled");
  });
});
