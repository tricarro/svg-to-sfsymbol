# svg-to-sfsymbol

A Python toolkit that prepares **flat SVG icons** for workflows aligned with **Apple SF Symbols**—especially the square template layout (small / medium / large rows and multiple weights). The goal is to take a single source icon and progressively normalize geometry, naming, stroke weights, and filled outlines so the results are easier to drop into symbol templates or Xcode-oriented pipelines.

The project is **still in development**; behavior and APIs may change. Usage and setup documentation will be added when the pipeline stabilizes.

## What it does (pipeline overview)

Processing is organized into **phases**, each building on the previous output:

1. **Phase 1 — Size variants**  
   Copies the original SVG and produces square canvases at **large (120×120)**, **medium (90×90)**, and **small (72×72)** user units. Geometry is scaled and centered using **baked coordinates** (affine transforms applied to paths and basic shapes) so stroke widths are not inflated by a parent `scale()` transform.

2. **Phase 2 — Weight slots**  
   Duplicates each size into nine **weight-named** files (e.g. `Regular-M.svg`, `Black-L.svg`) matching the usual SF Symbols weight order, then removes the intermediate `large.svg` / `medium.svg` / `small.svg` files. The original upload is kept separately.

3. **Phase 3 — Path weights**  
   Assigns **stroke-width** values per weight and scale (L / M / S) from a fixed table that matches the SF Symbol path-weight grid used in design references.

4. **Phase 4 — Stroke to fill**  
   Expands stroked paths into **filled outlines** (polygonal approximation via sampling and Shapely buffering), strips stroke presentation where converted, and **merges** sibling paths that share the same fill when safe—reducing the number of `<path>` elements while preserving appearance.

## Implementation notes

- **Security:** Untrusted SVG input is parsed with **defusedxml** to reduce XML entity / DTD risks.
- **Geometry:** **svg.path** is used for path parsing and sampling; **Shapely** handles buffering, unions, and merging filled regions.
- **Resources:** The repo may include reference assets (e.g. Apple-style square templates or sample icons) under `resources/` for local testing and alignment with template conventions.

## License / status

Work in progress; see the repository for license and contribution expectations once they are finalized.
