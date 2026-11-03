/** Diagram file model: draw.io files, the read table, ops and primitive changes. */
export type {
  DiagramCell,
  DiagramErrorCode,
  DiagramGeometry,
  DiagramOpError,
  DiagramPageState,
  DiagramPrimitive,
  DiagramState,
} from './types'
export { base64Decode, base64Encode, decodeCompressedPage, encodeCompressedPage } from './codec'
export type { PageCodec } from './codec'
export { detectDiagramFormat, extractDiagramXml } from './format'
export type {
  DiagramExtractResult,
  DiagramFormat,
  DiagramOpenFailure,
  DiagramOpenReason,
} from './format'
export { createDiagramFile, DEFAULT_PAGE_NAME, openDiagram, parseDiagramXml } from './file'
export type { DiagramFile, DiagramOpenResult, DiagramPageInfo } from './file'
export { diagramStateFromPages, parseGraphModel } from './model'
export type { GraphModelResult } from './model'
export { htmlLabelToText, labelText, textToHtmlLabel, textToLabel } from './label'
export { ARROWS, SHAPE_NAMES, SHAPE_STYLES, mergeStyle, parseStylePatch, shapeName } from './style'
export type { ArrowName, ShapeName } from './style'
export { formatDiagramRead, formatDiagramText, readDiagramTable, resolvePage } from './table'
export type {
  DiagramEdgeRow,
  DiagramPageListItem,
  DiagramPageTable,
  DiagramReadOptions,
  DiagramReadResult,
  DiagramShapeRow,
} from './table'
export { checkOpInput, DIAGRAM_OP_NAMES, DIAGRAM_OPS, diagramOpDefinition, opsNeedApp } from './ops'
export type { DiagramOpDefinition, DiagramOpName, OpInputSchema, OpPropertySchema } from './ops'
export { applyPrimitives, freeSpotRight, planDiagramOps } from './plan'
export type {
  DiagramApplyMode,
  DiagramBatchResult,
  DiagramOpResult,
  MermaidConverter,
  MermaidRequest,
  PlanOptions,
} from './plan'
export { applyDiagramOpsToFile, writeDiagramPrimitives } from './write'
export type { DiagramFileApplyOptions, DiagramFileApplyResult, DiagramWriteResult } from './write'
