import { describe, expect, it } from "vitest";
import { offsetFilledPathD } from "./pathOffset.js";

function xs(d: string): number[] {
  return [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => parseFloat(m[1]));
}

const signature = (d: string) => d.replace(/[^A-Za-z]/g, "");

describe("offsetFilledPathD", () => {
  const square = "M10 10H30V30H10Z";

  it("grows and shrinks a square by the offset distance", () => {
    expect(Math.min(...xs(offsetFilledPathD(square, 2)))).toBeCloseTo(8, 6);
    expect(Math.max(...xs(offsetFilledPathD(square, 2)))).toBeCloseTo(32, 6);
    expect(Math.min(...xs(offsetFilledPathD(square, -2)))).toBeCloseTo(12, 6);
  });

  it("is independent of winding direction", () => {
    const reversed = "M10 10V30H30V10Z";
    expect(Math.min(...xs(offsetFilledPathD(reversed, 2)))).toBeCloseTo(8, 6);
  });

  it("moves a hole the opposite way from its shell", () => {
    const ring = "M0 0H40V40H0Z M10 10H30V30H10Z";
    const grown = offsetFilledPathD(ring, 2, "evenodd");
    const holeXs = xs(grown.slice(grown.lastIndexOf("M")));
    expect(Math.min(...holeXs)).toBeCloseTo(12, 6);
    expect(Math.max(...holeXs)).toBeCloseTo(28, 6);
  });

  it("produces identical command structure for every distance", () => {
    const d = "M12 2C17.5 2 22 6.5 22 12S17.5 22 12 22 2 17.5 2 12 6.5 2 12 2ZM12 6A6 6 0 1 0 12 18 6 6 0 1 0 12 6Z";
    const sigs = [-1.5, 0, 2.5].map((t) => signature(offsetFilledPathD(d, t, "evenodd")));
    expect(sigs[0]).toBe(sigs[1]);
    expect(sigs[2]).toBe(sigs[1]);
  });

  it("removes out-and-back spikes instead of turning them into notches", () => {
    const spiky = "M0 0H20L19 1L20 0.02V20H0Z";
    const out = offsetFilledPathD(spiky, -2);
    expect(out.match(/L /g)?.length).toBeLessThanOrEqual(4);
  });
});
