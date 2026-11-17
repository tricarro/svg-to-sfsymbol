/**
 * Polygon ring → smooth SVG path: long edges stay straight, sharp turns stay corners, and
 * runs of short edges (flattened curves, buffered round joins/caps) are refit as cubic
 * Béziers (Schneider, "An Algorithm for Automatically Fitting Digitized Curves").
 */

export type Pt = [number, number];
type Cubic = [Pt, Pt, Pt, Pt];

export interface CurveFitOptions {
  /** Max distance (user units) between a fitted curve and the ring vertices it replaces. */
  tolerance?: number;
  /** Turning angle (degrees) at or above which a vertex is kept as a hard corner. */
  cornerDegrees?: number;
  /** Edges at least this long (user units) are emitted as straight lines. */
  straightLength?: number;
}

const DEFAULTS: Required<CurveFitOptions> = {
  tolerance: 0.08,
  cornerDegrees: 40,
  straightLength: 4,
};

const EPS = 1e-12;
const DECIMALS = 7;

export function formatCoord(v: number): string {
  let s = v.toFixed(DECIMALS);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s === "-0" ? "0" : s;
}

function fmtPt(p: Pt): string {
  return `${formatCoord(p[0])},${formatCoord(p[1])}`;
}

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const scale = (a: Pt, s: number): Pt => [a[0] * s, a[1] * s];
const dot = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];
const len = (a: Pt): number => Math.hypot(a[0], a[1]);
const dist = (a: Pt, b: Pt): number => len(sub(a, b));

function normalize(a: Pt): Pt {
  const l = len(a);
  return l > EPS ? [a[0] / l, a[1] / l] : [0, 0];
}

function bezierPoint(c: Pt[], t: number): Pt {
  const tmp = c.map((p) => [p[0], p[1]] as Pt);
  for (let k = 1; k < tmp.length; k++) {
    for (let i = 0; i < tmp.length - k; i++) {
      tmp[i] = [
        (1 - t) * tmp[i][0] + t * tmp[i + 1][0],
        (1 - t) * tmp[i][1] + t * tmp[i + 1][1],
      ];
    }
  }
  return tmp[0];
}

class Fitter {
  private readonly out: Cubic[] = [];

  constructor(
    private readonly pts: Pt[],
    private readonly errorSq: number
  ) {}

  fit(tan1: Pt, tan2: Pt): Cubic[] {
    this.fitCubic(0, this.pts.length - 1, tan1, tan2);
    return this.out;
  }

  private fitCubic(first: number, last: number, tan1: Pt, tan2: Pt): void {
    const pts = this.pts;
    if (last - first === 1) {
      const d = dist(pts[first], pts[last]) / 3;
      this.out.push([pts[first], add(pts[first], scale(tan1, d)), add(pts[last], scale(tan2, d)), pts[last]]);
      return;
    }
    const u = this.chordLengthParameterize(first, last);
    let maxError = Math.max(this.errorSq, this.errorSq * this.errorSq);
    let split = Math.floor((first + last) / 2);
    let inOrder = true;
    for (let i = 0; i <= 4; i++) {
      const curve = this.generateBezier(first, last, u, tan1, tan2);
      const [err, idx] = this.findMaxError(first, last, curve, u);
      if (err < this.errorSq && inOrder) {
        this.out.push(curve);
        return;
      }
      split = idx;
      if (err >= maxError) break;
      inOrder = this.reparameterize(first, last, u, curve);
      maxError = err;
    }
    const center = normalize(sub(pts[split - 1], pts[split + 1]));
    this.fitCubic(first, split, tan1, center);
    this.fitCubic(split, last, scale(center, -1), tan2);
  }

  private chordLengthParameterize(first: number, last: number): number[] {
    const u = [0];
    for (let i = first + 1; i <= last; i++) {
      u.push(u[u.length - 1] + dist(this.pts[i], this.pts[i - 1]));
    }
    const total = u[u.length - 1];
    return total > EPS ? u.map((v) => v / total) : u.map((_, i) => i / (u.length - 1));
  }

  private generateBezier(first: number, last: number, u: number[], tan1: Pt, tan2: Pt): Cubic {
    const pts = this.pts;
    const p1 = pts[first];
    const p2 = pts[last];
    let c00 = 0;
    let c01 = 0;
    let c11 = 0;
    let x0 = 0;
    let x1 = 0;
    for (let i = 0; i < u.length; i++) {
      const t = u[i];
      const mt = 1 - t;
      const b = 3 * t * mt;
      const b0 = mt * mt * mt;
      const b1 = b * mt;
      const b2 = b * t;
      const b3 = t * t * t;
      const a1 = scale(tan1, b1);
      const a2 = scale(tan2, b2);
      const tmp = sub(sub(pts[first + i], scale(p1, b0 + b1)), scale(p2, b2 + b3));
      c00 += dot(a1, a1);
      c01 += dot(a1, a2);
      c11 += dot(a2, a2);
      x0 += dot(a1, tmp);
      x1 += dot(a2, tmp);
    }
    const det = c00 * c11 - c01 * c01;
    let alpha1: number;
    let alpha2: number;
    if (Math.abs(det) > EPS) {
      alpha1 = (x0 * c11 - x1 * c01) / det;
      alpha2 = (c00 * x1 - c01 * x0) / det;
    } else {
      const s0 = c00 + c01;
      const s1 = c01 + c11;
      alpha1 = alpha2 = Math.abs(s0) > EPS ? x0 / s0 : Math.abs(s1) > EPS ? x1 / s1 : 0;
    }
    const segLen = dist(p1, p2);
    const eps = EPS * segLen;
    let h1: Pt | null = null;
    let h2: Pt | null = null;
    if (alpha1 < eps || alpha2 < eps) {
      alpha1 = alpha2 = segLen / 3;
    } else {
      const line = sub(p2, p1);
      h1 = scale(tan1, alpha1);
      h2 = scale(tan2, alpha2);
      if (dot(h1, line) - dot(h2, line) > segLen * segLen) {
        alpha1 = alpha2 = segLen / 3;
        h1 = h2 = null;
      }
    }
    return [p1, add(p1, h1 ?? scale(tan1, alpha1)), add(p2, h2 ?? scale(tan2, alpha2)), p2];
  }

  private reparameterize(first: number, last: number, u: number[], curve: Cubic): boolean {
    for (let i = first; i <= last; i++) {
      u[i - first] = this.findRoot(curve, this.pts[i], u[i - first]);
    }
    for (let i = 1; i < u.length; i++) {
      if (u[i] <= u[i - 1]) return false;
    }
    return true;
  }

  private findRoot(curve: Cubic, point: Pt, t: number): number {
    const d1 = [0, 1, 2].map((i) => scale(sub(curve[i + 1], curve[i]), 3));
    const d2 = [0, 1].map((i) => scale(sub(d1[i + 1], d1[i]), 2));
    const diff = sub(bezierPoint(curve, t), point);
    const p1 = bezierPoint(d1, t);
    const p2 = bezierPoint(d2, t);
    const df = dot(p1, p1) + dot(diff, p2);
    return Math.abs(df) < EPS ? t : t - dot(diff, p1) / df;
  }

  private findMaxError(first: number, last: number, curve: Cubic, u: number[]): [number, number] {
    let index = Math.floor((last - first + 1) / 2) + first;
    let maxDist = 0;
    for (let i = first + 1; i < last; i++) {
      const p = bezierPoint(curve, u[i - first]);
      const d = dot(sub(p, this.pts[i]), sub(p, this.pts[i]));
      if (d >= maxDist) {
        maxDist = d;
        index = i;
      }
    }
    return [maxDist, index];
  }
}

function dedupeRing(coords: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of coords) {
    const prev = out[out.length - 1];
    if (!prev || dist(prev, p) > 1e-9) out.push(p);
  }
  while (out.length > 1 && dist(out[0], out[out.length - 1]) <= 1e-9) out.pop();
  return out;
}

function densify(pts: Pt[], maxStep: number): Pt[] {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const n = Math.ceil(dist(a, b) / maxStep);
    for (let k = 1; k < n; k++) out.push(add(a, scale(sub(b, a), k / n)));
    out.push(b);
  }
  return out;
}

function fitRun(pts: Pt[], tan1: Pt, tan2: Pt, o: Required<CurveFitOptions>): Cubic[] {
  const dense = densify(pts, o.straightLength / 3);
  return new Fitter(dense, o.tolerance * o.tolerance).fit(tan1, tan2);
}

/**
 * Closed polygon ring (first point not repeated at the end, or repeated — both accepted)
 * → `M … Z` path data using straight lines and cubic Béziers.
 */
export function ringToCurvePathD(coords: Pt[], options: CurveFitOptions = {}): string {
  const o = { ...DEFAULTS, ...options };
  const ring = dedupeRing(coords);
  const n = ring.length;
  if (n < 2) return "";
  if (n < 3) return `M ${fmtPt(ring[0])} L ${fmtPt(ring[1])} Z`;

  const at = (i: number): Pt => ring[((i % n) + n) % n];
  const segLong = (i: number) => dist(at(i), at(i + 1)) >= o.straightLength;
  const cosCorner = Math.cos((o.cornerDegrees * Math.PI) / 180);
  const isCorner = (i: number) => {
    const a = normalize(sub(at(i), at(i - 1)));
    const b = normalize(sub(at(i + 1), at(i)));
    return dot(a, b) <= cosCorner;
  };
  const isBreak = (i: number) => isCorner(i) || segLong(i - 1) || segLong(i);

  let start = -1;
  for (let i = 0; i < n; i++) {
    if (isBreak(i)) {
      start = i;
      break;
    }
  }

  if (start < 0) {
    const pts = [...ring, ring[0]];
    const t = normalize(sub(ring[1], ring[n - 1]));
    const curves = fitRun(pts, t, scale(t, -1), o);
    return `M ${fmtPt(ring[0])} ${curves.map((c) => `C ${fmtPt(c[1])} ${fmtPt(c[2])} ${fmtPt(c[3])}`).join(" ")} Z`;
  }

  const parts = [`M ${fmtPt(at(start))}`];
  let i = start;
  const end = start + n;
  while (i < end) {
    if (segLong(i)) {
      parts.push(`L ${fmtPt(at(i + 1))}`);
      i++;
      continue;
    }
    let j = i + 1;
    while (j < end && !isBreak(j)) j++;
    const run: Pt[] = [];
    for (let k = i; k <= j; k++) run.push(at(k));
    if (run.length === 2) {
      parts.push(`L ${fmtPt(run[1])}`);
    } else {
      const tan1 =
        segLong(i - 1) && !isCorner(i)
          ? normalize(sub(at(i), at(i - 1)))
          : normalize(sub(at(i + 1), at(i)));
      const tan2 =
        segLong(j) && !isCorner(j)
          ? normalize(sub(at(j), at(j + 1)))
          : normalize(sub(at(j - 1), at(j)));
      for (const c of fitRun(run, tan1, tan2, o)) {
        parts.push(`C ${fmtPt(c[1])} ${fmtPt(c[2])} ${fmtPt(c[3])}`);
      }
    }
    i = j;
  }
  parts.push("Z");
  return parts.join(" ");
}
