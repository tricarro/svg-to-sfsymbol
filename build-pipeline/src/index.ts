export { runFullConvert, type FullConvertResult } from "./runFullConvert.js";
export type { MissingPolicy } from "./runFullConvert.js";

export {
  SIZE_VARIANTS,
  buildVariantSvg,
  parseSvgString,
  readViewBox,
  runSizeVariants,
  type SizeVariant,
} from "./steps/sizeVariants.js";

export { SF_SYMBOL_WEIGHTS, WEIGHT_SIZE_SUFFIX, runWeightReplicas } from "./steps/weightReplicas.js";

export {
  STROKE_WIDTH_BY_WEIGHT_SUFFIX,
  applyStrokeWidthsToTree,
  elementIsStroked,
  parseWeightStem,
  runStrokeWidths,
} from "./steps/strokeWidths.js";

export {
  expandStrokesInTree,
  fillElementToGeometry,
  jtsGeometryToSvgPathD,
  jtsLinealGeometryToPathD,
  strokeElementToOutlineGeometry,
  unionJtsGeometries,
  runStrokeToOutline,
} from "./steps/strokeToOutline.js";

export {
  defaultSquareTemplatePath,
  runSquareTemplateMerge,
} from "./steps/squareTemplateMerge.js";

export {
  classifySvgRouting,
  classifySvgStrokedOrFilled,
  elementHasVisibleFill,
  elementHasVisibleStroke,
  representativeStrokeStyleForMixedPreprocess,
} from "./routing/svgRouting.js";

export { mixedIconToStrokedSvg } from "./preprocess/mixedToStrokedSvg.js";

export {
  defaultVariableTemplatePath,
  mergeFilledIconIntoVariableTemplate,
  resolveVariableTemplatePath,
} from "./filled/variableTemplateMerge.js";

export { mixedIconToFillOnlySvg } from "./filled/mixedIconToFilled.js";

export {
  deepCloneElement,
  elementChildren,
  elementToBytes,
  localTag,
  parseSvgFile,
  parseSvgXml,
  stripDoctype,
  svgDocumentElement,
  SVG_NS,
  type SvgDocument,
  type SvgElement,
} from "./svg/xml.js";
