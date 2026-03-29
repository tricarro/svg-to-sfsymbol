import type { PathLike } from "node:fs";
import Geometry from "jsts/org/locationtech/jts/geom/Geometry.js";
import { type SvgElement } from "./xml.js";
/**
 * JSTS unary union of geometries (empty inputs filtered). For mixed fill+stroke merging.
 */
export declare function unionJtsGeometries(geoms: Geometry[]): Geometry | null;
export declare function jtsGeometryToSvgPathD(geom: Geometry): {
    d: string;
    evenodd: boolean;
};
export declare function strokeElementToOutlineGeometry(el: SvgElement, flatness: number): Geometry | null;
export declare function fillElementToGeometry(el: SvgElement, flatness: number): Geometry | null;
export declare function expandStrokesInTree(root: SvgElement, flatness?: number): number;
export declare function runPhase4(outputDir: PathLike, flatness?: number): Record<string, number>;
