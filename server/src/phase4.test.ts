import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  expandStrokesInTree,
  fillElementToGeometry,
  mergeOverlappingFills,
  runPhase4,
} from "./phase4.js";
import { parseSvgString, runPhase1 } from "./phase1.js";
import { runPhase2 } from "./phase2.js";
import { runPhase3 } from "./phase3.js";
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("expandStrokesInTree", () => {
  it("converts open stroked path and removes stroke", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
    <path d="M 1 5 L 9 5" stroke="#000" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
    const root = parseSvgString(svg);
    const n = expandStrokesInTree(root, 0.5);
    expect(n).toBe(1);
    const doc = root.ownerDocument!;
    const paths = doc.getElementsByTagName("path");
    expect(paths.length).toBe(1);
    const p = paths.item(0)!;
    expect(p.getAttribute("stroke")).toBeNull();
    expect(p.getAttribute("fill")).toBe("#000");
    const d = p.getAttribute("d") || "";
    expect(d).toContain("L");
  });

  it("converts stroked rect (with rx) and circle to outline paths", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <rect x="3" y="10" width="26" height="6" rx="1" stroke="#000" stroke-width="1" fill="none"/>
    <circle cx="16" cy="6" r="3" stroke="#000" stroke-width="1" fill="none"/>
    </svg>`;
    const root = parseSvgString(svg);
    expect(expandStrokesInTree(root)).toBe(2);
    const doc = root.ownerDocument!;
    expect(doc.getElementsByTagName("rect").length).toBe(0);
    expect(doc.getElementsByTagName("circle").length).toBe(0);
    const paths = doc.getElementsByTagName("path");
    expect(paths.length).toBe(2);
    for (let i = 0; i < paths.length; i++) {
      const p = paths.item(i)!;
      expect(p.getAttribute("stroke")).toBeNull();
      expect(p.getAttribute("fill-rule")).toBe("evenodd");
    }
  });

  it("fills nonzero pieces by winding number, not by orientation", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
    <path d="M0 0H10V10H0Z M12 12V14H14V12Z M2 2V8H8V2Z" fill="#000"/>
    </svg>`;
    const root = parseSvgString(svg);
    const path = root.ownerDocument!.getElementsByTagName("path").item(0)!;
    const g = fillElementToGeometry(path, 0.1) as unknown as { getArea(): number };
    expect(g.getArea()).toBeCloseTo(100 - 36 + 4, 5);
  });

  it("merges a fill and its outlined stroke into one non-overlapping path", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <path d="M8 8H24V24H8Z" fill="#000"/>
    <path d="M8 8H24V24H8Z" fill="none" stroke="#000" stroke-width="2"/>
    <path d="M28 2H30V4H28Z" fill="#000"/>
    </svg>`;
    const root = parseSvgString(svg);
    expandStrokesInTree(root);
    expect(mergeOverlappingFills(root)).toBe(2);
    const paths = root.ownerDocument!.getElementsByTagName("path");
    expect(paths.length).toBe(2);
    const merged = fillElementToGeometry(paths.item(0)!, 0.05) as unknown as { getArea(): number };
    expect(merged.getArea()).toBeCloseTo(18 * 18, 0);
  });

  it("skips stroke-dasharray", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
    <path d="M 0 0 L 10 10" stroke="#000" stroke-width="2" stroke-dasharray="2 2"/>
    </svg>`;
    const root = parseSvgString(svg);
    const n = expandStrokesInTree(root);
    expect(n).toBe(0);
    const doc = root.ownerDocument!;
    const p = doc.getElementsByTagName("path").item(0)!;
    expect(p.getAttribute("stroke")).toBe("#000");
  });
});

describe("phase4 pipeline calendar", () => {
  it("matches Python test expectations when calendar fixture exists", () => {
    const cal = join(repoRoot, "resources", "calendar-today.svg");
    if (!existsSync(cal)) {
      return;
    }
    const tmp = mkdtempSync(join(tmpdir(), "p4cal_"));
    try {
      runPhase1(cal, tmp);
      runPhase2(tmp);
      runPhase3(tmp);
      const counts = runPhase4(tmp);
      expect(counts["Regular-M"]).toBe(5);
      const svgOut = readFileSync(join(tmp, "Regular-M.svg"), "utf-8");
      expect(svgOut).not.toContain('stroke="#');
      expect(svgOut).not.toContain("stroke-width");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
