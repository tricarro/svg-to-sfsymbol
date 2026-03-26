import { type SvgElement } from "./xml.js";
/** x' = a*x + c*y + e ; y' = b*x + d*y + f (SVG matrix column convention) */
export type Affine = readonly [number, number, number, number, number, number];
export declare function matIdentity(): Affine;
export declare function matMul(m1: Affine, m2: Affine): Affine;
export declare function matTranslate(tx: number, ty: number): Affine;
export declare function matScale(sx: number, sy: number): Affine;
export declare function matRotateDeg(angleDeg: number): Affine;
export declare function applyAffinePt(x: number, y: number, m: Affine): [number, number];
export declare function applyAffineZ(zre: number, zim: number, m: Affine): [number, number];
export declare function buildPhase1BakeMatrix(s: number, ox: number, oy: number, tx: number, ty: number): Affine;
export declare function parseTransformAttr(raw: string | null | undefined): Affine;
export declare function bakePathD(d: string, m: Affine): string;
export declare function bakeBasicShape(el: SvgElement, m: Affine): void;
export declare function bakeVisualSubtree(el: SvgElement, mAccum: Affine): void;
