import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { expandStrokesInTree, runStrokeToOutline } from "./strokeToOutline.js";
import { parseSvgString, runSizeVariants } from "./sizeVariants.js";
import { runWeightReplicas } from "./weightReplicas.js";
import { runStrokeWidths } from "./strokeWidths.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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

describe("strokeToOutline pipeline calendar", () => {
  it("matches Python test expectations when calendar fixture exists", () => {
    const cal = join(packageRoot, "resources", "calendar-today.svg");
    if (!existsSync(cal)) {
      return;
    }
    const tmp = mkdtempSync(join(tmpdir(), "p4cal_"));
    try {
      runSizeVariants(cal, tmp);
      runWeightReplicas(tmp);
      runStrokeWidths(tmp);
      const counts = runStrokeToOutline(tmp);
      expect(counts["Regular-M"]).toBe(5);
      const svgOut = readFileSync(join(tmp, "Regular-M.svg"), "utf-8");
      expect(svgOut).not.toContain('stroke="#');
      expect(svgOut).not.toContain("stroke-width");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
