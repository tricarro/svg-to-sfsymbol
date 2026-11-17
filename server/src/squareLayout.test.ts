import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LARGE_SIDE_PX, MEDIUM_SIDE_PX, SMALL_SIDE_PX } from "./phase1.js";
import { STROKE_WIDTH_BY_WEIGHT_SUFFIX } from "./phase3.js";
import { runFullConvert } from "./pipeline.js";
import { mixedIconToStrokedSvg } from "./mixedIconToStrokedSvg.js";
import { elementsBBox } from "./slotLayout.js";
import { elementChildren, localTag, parseSvgXml, svgDocumentElement, type SvgElement } from "./xml.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const squareTemplate = join(repoRoot, "resources", "square_template.svg");

function findById(root: SvgElement, id: string): SvgElement | null {
  if (root.getAttribute("id") === id) return root;
  for (const c of elementChildren(root)) {
    const f = findById(c, id);
    if (f) return f;
  }
  return null;
}

function convert(svg: string): SvgElement {
  const tmp = mkdtempSync(join(tmpdir(), "sqlayout_"));
  try {
    const input = join(tmp, "icon.svg");
    writeFileSync(input, svg);
    const out = join(tmp, "out.svg");
    runFullConvert(input, tmp, { phase5Template: squareTemplate, phase5Out: out });
    return svgDocumentElement(parseSvgXml(readFileSync(out, "utf-8")));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function slotArtBBox(root: SvgElement, id: string) {
  const slot = findById(root, id)!;
  const wrap = elementChildren(slot).find((c) => localTag(c) === "g")!;
  return elementsBBox([wrap])!;
}

const strokedIcon =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
  `<path d="M5 16A11 11 0 1 0 27 16A11 11 0 1 0 5 16Z" stroke="#000" stroke-width="2" fill="none"/></svg>`;

describe("square template layout", () => {
  it("uses Apple's small/large scale factors relative to medium", () => {
    expect(SMALL_SIDE_PX / MEDIUM_SIDE_PX).toBeCloseTo(0.783, 3);
    expect(LARGE_SIDE_PX / MEDIUM_SIDE_PX).toBeCloseTo(1.29, 3);
  });

  it("writes margin guides for every variant and centers art on cap height", () => {
    if (!existsSync(squareTemplate)) return;
    const root = convert(strokedIcon);
    const svg = root.toString();
    expect(svg.match(/id="left-margin-/g)).toHaveLength(27);
    expect(svg.match(/id="right-margin-/g)).toHaveLength(27);
    const regularD = (findById(root, "Regular-M")!.getElementsByTagName("path").item(0) as SvgElement).getAttribute("d")!;
    expect(regularD).toMatch(/C -?\d/);
    expect(regularD.match(/L /g)?.length ?? 0).toBeLessThan(4);

    const art = slotArtBBox(root, "Regular-M");
    const capMid = (-70.459) / 2;
    expect((art.minY + art.maxY) / 2).toBeCloseTo(capMid, 0);

    const left = findById(root, "left-margin-Regular-M")!;
    const right = findById(root, "right-margin-Regular-M")!;
    const width = parseFloat(right.getAttribute("x1")!) - parseFloat(left.getAttribute("x1")!);
    expect(width).toBeGreaterThan(art.maxX - art.minX);
  });

  it("keeps shapes that inherit fill=none from the root unfilled after merging", () => {
    if (!existsSync(squareTemplate)) return;
    const root = convert(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">` +
        `<rect x="3" y="10" width="26" height="6" rx="1" stroke="#0F0F0F"/>` +
        `<circle cx="16" cy="6" r="3" stroke="#0F0F0F"/></svg>`
    );
    const slot = findById(root, "Regular-M")!;
    expect(slot.getElementsByTagName("rect").length).toBe(0);
    expect(slot.getElementsByTagName("circle").length).toBe(0);
    const paths = slot.getElementsByTagName("path");
    expect(paths.length).toBe(1);
    expect(paths.item(0)!.getAttribute("fill-rule")).toBe("evenodd");
  });

  it("moves filled edges of mixed icons by the same amount as the strokes beside them", () => {
    if (!existsSync(squareTemplate)) return;
    const mixed =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
      `<path d="M4 4H12" stroke="#000" stroke-width="2" fill="none"/>` +
      `<rect x="12" y="12" width="16" height="16" fill="#000"/></svg>`;
    const root = convert(mixedIconToStrokedSvg(mixed));
    const filledWidth = (id: string) => {
      const slot = findById(root, id)!;
      const paths = [...(slot.getElementsByTagName("path") as unknown as Iterable<SvgElement>)];
      const square = paths[paths.length - 1];
      const b = elementsBBox([square])!;
      return b.maxX - b.minX;
    };
    const sourceStroke = (2 / 32) * MEDIUM_SIDE_PX;
    expect(filledWidth("Regular-M")).toBeCloseTo(
      (16 / 32) * MEDIUM_SIDE_PX + STROKE_WIDTH_BY_WEIGHT_SUFFIX["Regular-M"] - sourceStroke,
      1
    );
    expect(filledWidth("Black-M")).toBeGreaterThan(filledWidth("Regular-M"));
    expect(filledWidth("Ultralight-M")).toBeLessThan(filledWidth("Regular-M"));
  });
});
