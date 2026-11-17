import { describe, expect, it } from "vitest";
import SvgPath from "svgpath";
import { formatCoord, ringToCurvePathD, type Pt } from "./curveFit.js";

function circleRing(cx: number, cy: number, r: number, n: number): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * 2 * Math.PI;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)] as Pt;
  });
}

function sampleD(d: string, perSeg = 20): Pt[] {
  const pts: Pt[] = [];
  let cur: Pt = [0, 0];
  const segs = (new SvgPath(d).abs() as unknown as { segments: (string | number)[][] }).segments;
  for (const s of segs) {
    const n = s.slice(1).map(Number);
    if (s[0] === "M" || s[0] === "L") {
      cur = [n[0], n[1]];
      pts.push(cur);
    } else if (s[0] === "C") {
      for (let i = 1; i <= perSeg; i++) {
        const t = i / perSeg;
        const u = 1 - t;
        pts.push([
          u ** 3 * cur[0] + 3 * u * u * t * n[0] + 3 * u * t * t * n[2] + t ** 3 * n[4],
          u ** 3 * cur[1] + 3 * u * u * t * n[1] + 3 * u * t * t * n[3] + t ** 3 * n[5],
        ]);
      }
      cur = [n[4], n[5]];
    }
  }
  return pts;
}

describe("ringToCurvePathD", () => {
  it("refits a densely sampled circle as a few cubics within tolerance", () => {
    const d = ringToCurvePathD(circleRing(50, 50, 20, 128));
    expect(d).not.toContain("L ");
    const curves = d.match(/C /g)?.length ?? 0;
    expect(curves).toBeGreaterThan(0);
    expect(curves).toBeLessThan(16);
    for (const [x, y] of sampleD(d)) {
      expect(Math.abs(Math.hypot(x - 50, y - 50) - 20)).toBeLessThan(0.1);
    }
  });

  it("keeps long straight edges and sharp corners as lines", () => {
    const d = ringToCurvePathD([
      [0, 0],
      [40, 0],
      [40, 40],
      [0, 40],
    ]);
    expect(d).not.toContain("C ");
    expect(d.match(/L /g)).toHaveLength(4);
  });

  it("joins straight edges to rounded corners without a kink", () => {
    const ring: Pt[] = [];
    const r = 5;
    for (const [cx, cy, a0] of [
      [35, 5, -90],
      [35, 35, 0],
      [5, 35, 90],
      [5, 5, 180],
    ] as const) {
      for (let i = 0; i <= 8; i++) {
        const a = ((a0 + (i / 8) * 90) * Math.PI) / 180;
        ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
    }
    const d = ringToCurvePathD(ring);
    expect(d.match(/L /g)?.length).toBe(4);
    expect(d.match(/C /g)?.length).toBeGreaterThanOrEqual(4);
  });
});

describe("formatCoord", () => {
  it("uses up to 7 decimals without trailing zeros", () => {
    expect(formatCoord(1.123456789)).toBe("1.1234568");
    expect(formatCoord(2.5)).toBe("2.5");
    expect(formatCoord(3)).toBe("3");
    expect(formatCoord(-0.00000001)).toBe("0");
  });
});
