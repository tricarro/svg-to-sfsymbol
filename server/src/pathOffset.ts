/**
 * Grow or shrink filled path outlines while keeping their structure: every anchor moves along
 * its outward normal and handles keep their direction, so outputs for different distances
 * have the same subpaths, commands and point counts (SF Symbols interpolation requirement).
 */
import SvgPath from "svgpath";
import { formatCoord, type Pt } from "./curveFit.js";

type Seg = { kind: "L"; end: Pt } | { kind: "C"; c1: Pt; c2: Pt; end: Pt };
interface Sub {
  start: Pt;
  segs: Seg[];
  closed: boolean;
}

export type FillRule = "nonzero" | "evenodd";

/** Upper bound on the miter scale at sharp corners (1 / cos(half angle)). */
const MAX_MITER = 2;

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const scale = (a: Pt, s: number): Pt => [a[0] * s, a[1] * s];
const dot = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];
const len = (a: Pt): number => Math.hypot(a[0], a[1]);
const near = (a: Pt, b: Pt) => len(sub(a, b)) < 1e-6;

function normalize(a: Pt): Pt | null {
  const l = len(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l] : null;
}

/** Normalized subpaths: absolute M/L/C only (H/V → L, Q → C, arcs → C). */
export function parseSubpaths(d: string): Sub[] {
  const p = new SvgPath(d).abs().unshort().unarc();
  const subs: Sub[] = [];
  let cur: Sub | null = null;
  let pos: Pt = [0, 0];
  const ensure = (): Sub => {
    if (!cur || cur.closed) {
      cur = { start: pos, segs: [], closed: false };
      subs.push(cur);
    }
    return cur;
  };
  for (const s of (p as unknown as { segments: (string | number)[][] }).segments) {
    const cmd = String(s[0]);
    const n = s.slice(1).map(Number);
    if (cmd === "M") {
      pos = [n[0], n[1]];
      cur = { start: pos, segs: [], closed: false };
      subs.push(cur);
    } else if (cmd === "L") {
      pos = [n[0], n[1]];
      ensure().segs.push({ kind: "L", end: pos });
    } else if (cmd === "H") {
      pos = [n[0], pos[1]];
      ensure().segs.push({ kind: "L", end: pos });
    } else if (cmd === "V") {
      pos = [pos[0], n[0]];
      ensure().segs.push({ kind: "L", end: pos });
    } else if (cmd === "C") {
      const c1: Pt = [n[0], n[1]];
      const c2: Pt = [n[2], n[3]];
      pos = [n[4], n[5]];
      ensure().segs.push({ kind: "C", c1, c2, end: pos });
    } else if (cmd === "Q") {
      const q: Pt = [n[0], n[1]];
      const end: Pt = [n[2], n[3]];
      const c1 = add(pos, scale(sub(q, pos), 2 / 3));
      const c2 = add(end, scale(sub(q, end), 2 / 3));
      pos = end;
      ensure().segs.push({ kind: "C", c1, c2, end });
    } else if (cmd === "Z") {
      if (cur) {
        cur.closed = true;
        pos = cur.start;
      }
    }
  }
  return subs.filter((s) => s.segs.length > 0);
}

/**
 * Drop zero-length/tiny straight segments and out-and-back spikes (common in design-tool
 * stroke outlines); offsetting them produces notches and hairs.
 */
function cleanSub(s: Sub, minLen: number): Sub {
  let segs = [...s.segs];
  const startOf = (list: Seg[], k: number): Pt => (k === 0 ? s.start : list[k - 1].end);
  let changed = true;
  while (changed && segs.length > 2) {
    changed = false;
    for (let k = 0; k < segs.length; k++) {
      const g = segs[k];
      const a = startOf(segs, k);
      if (g.kind === "L" && len(sub(g.end, a)) < minLen && k > 0) {
        const prev = segs[k - 1];
        segs[k - 1] = prev.kind === "L" ? { kind: "L", end: g.end } : { ...prev, end: g.end };
        segs.splice(k, 1);
        changed = true;
        break;
      }
      const next = segs[k + 1];
      if (g.kind === "L" && next?.kind === "L") {
        const tin = normalize(sub(g.end, a));
        const tout = normalize(sub(next.end, g.end));
        if (tin && tout && dot(tin, tout) < -0.95) {
          segs.splice(k, 2, { kind: "L", end: next.end });
          changed = true;
          break;
        }
      }
    }
  }
  return { start: s.start, segs, closed: s.closed };
}

function cubicAt(p0: Pt, c1: Pt, c2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1],
  ];
}

function flatten(s: Sub): Pt[] {
  const pts: Pt[] = [s.start];
  let prev = s.start;
  for (const seg of s.segs) {
    if (seg.kind === "L") pts.push(seg.end);
    else for (let i = 1; i <= 16; i++) pts.push(cubicAt(prev, seg.c1, seg.c2, seg.end, i / 16));
    prev = seg.end;
  }
  return pts;
}

function windingAt(rings: Pt[][], p: Pt): number {
  let w = 0;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (a[1] <= p[1]) {
        if (b[1] > p[1] && (b[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (b[1] - a[1]) > 0) w++;
      } else if (b[1] <= p[1] && (b[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (b[1] - a[1]) < 0) {
        w--;
      }
    }
  }
  return w;
}

function insideFill(rings: Pt[][], p: Pt, rule: FillRule): boolean {
  const w = windingAt(rings, p);
  return rule === "evenodd" ? w % 2 !== 0 : w !== 0;
}

/** Anchor list for a subpath, treating it as closed (fills always close). */
function anchorsOf(s: Sub): { anchors: Pt[]; explicitClose: boolean } {
  const ends = s.segs.map((g) => g.end);
  const explicitClose = near(ends[ends.length - 1], s.start);
  const anchors = explicitClose ? [s.start, ...ends.slice(0, -1)] : [s.start, ...ends];
  return { anchors, explicitClose };
}

/** +1 when the ink lies to the left of the travel direction (perp = [-dy, dx]), else −1. */
function inkSide(s: Sub, rings: Pt[][], rule: FillRule, probe: number): number {
  const pts = flatten(s);
  let votes = 0;
  const step = Math.max(1, Math.floor(pts.length / 7));
  for (let i = 0; i + 1 < pts.length; i += step) {
    const t = normalize(sub(pts[i + 1], pts[i]));
    if (!t) continue;
    const mid = scale(add(pts[i], pts[i + 1]), 0.5);
    const left: Pt = [-t[1], t[0]];
    const inL = insideFill(rings, add(mid, scale(left, probe)), rule);
    const inR = insideFill(rings, add(mid, scale(left, -probe)), rule);
    if (inL && !inR) votes++;
    else if (inR && !inL) votes--;
  }
  return votes >= 0 ? 1 : -1;
}

function offsetSub(s: Sub, delta: number, side: number): Sub {
  const { anchors, explicitClose } = anchorsOf(s);
  const m = anchors.length;
  const segs: Seg[] = [...s.segs];
  if (!explicitClose) segs.push({ kind: "L", end: s.start });
  const startOf = (k: number) => anchors[k];
  const endOf = (k: number) => anchors[(k + 1) % m];

  const outTangent = (k: number): Pt | null => {
    const g = segs[k];
    const a = startOf(k);
    if (g.kind === "C") return normalize(sub(g.c1, a)) ?? normalize(sub(g.c2, a)) ?? normalize(sub(endOf(k), a));
    return normalize(sub(endOf(k), a));
  };
  const inTangent = (k: number): Pt | null => {
    const g = segs[k];
    const b = endOf(k);
    if (g.kind === "C") return normalize(sub(b, g.c2)) ?? normalize(sub(b, g.c1)) ?? normalize(sub(b, startOf(k)));
    return normalize(sub(b, startOf(k)));
  };
  const outward = (t: Pt | null): Pt | null => (t ? scale([-t[1], t[0]], -side) : null);

  const moves: Pt[] = anchors.map((_, k) => {
    const nIn = outward(inTangent((k - 1 + m) % m));
    const nOut = outward(outTangent(k));
    const a = nIn ?? nOut;
    const b = nOut ?? nIn;
    if (!a || !b) return [0, 0];
    const bis = normalize(add(a, b)) ?? a;
    const cosHalf = dot(bis, a);
    const miter = Math.min(MAX_MITER, 1 / Math.max(cosHalf, 1 / MAX_MITER));
    return scale(bis, delta * miter);
  });

  const moved = anchors.map((p, k) => add(p, moves[k]));
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (let k = 0; k < m; k++) {
      const j = (k + 1) % m;
      if (dot(sub(moved[j], moved[k]), sub(anchors[j], anchors[k])) < 0) {
        const mid = scale(add(moved[k], moved[j]), 0.5);
        moved[k] = mid;
        moved[j] = mid;
        changed = true;
      }
    }
    if (!changed) break;
  }
  const outSegs: Seg[] = s.segs.map((g, k) => {
    const a0 = startOf(k);
    const b0 = endOf(k);
    const a1 = moved[k];
    const b1 = moved[(k + 1) % m];
    if (g.kind === "L") return { kind: "L", end: b1 };
    const chord0 = len(sub(b0, a0));
    const r = chord0 > 1e-9 ? Math.min(4, Math.max(0.25, len(sub(b1, a1)) / chord0)) : 1;
    return {
      kind: "C",
      c1: add(a1, scale(sub(g.c1, a0), r)),
      c2: add(b1, scale(sub(g.c2, b0), r)),
      end: b1,
    };
  });
  return { start: moved[0], segs: outSegs, closed: s.closed };
}

function fmt(p: Pt): string {
  return `${formatCoord(p[0])},${formatCoord(p[1])}`;
}

export function subpathsToD(subs: Sub[]): string {
  return subs
    .map((s) => {
      const body = s.segs
        .map((g) => (g.kind === "L" ? `L ${fmt(g.end)}` : `C ${fmt(g.c1)} ${fmt(g.c2)} ${fmt(g.end)}`))
        .join(" ");
      return `M ${fmt(s.start)} ${body}${s.closed ? " Z" : ""}`;
    })
    .join(" ");
}

/**
 * Offset a filled path outward (delta > 0) or inward (delta < 0) in its own user units.
 * delta = 0 still normalizes commands, so every output for one input has identical structure.
 */
export function offsetFilledPathD(d: string, delta: number, rule: FillRule = "nonzero"): string {
  const raw = parseSubpaths(d);
  if (!raw.length) return "";
  let minX = Infinity;
  let maxX = -Infinity;
  for (const r of raw.map(flatten)) for (const p of r) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
  }
  const extent = Math.max(maxX - minX, 1e-6);
  const subs = raw.map((s) => cleanSub(s, extent * 2e-3));
  const rings = subs.map(flatten);
  const probe = Math.max(1e-3, extent * 1e-3);
  return subpathsToD(subs.map((s) => offsetSub(s, delta, inkSide(s, rings, rule, probe))));
}
