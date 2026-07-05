/**
 * `lunas-ls` — the Lunas language server core.
 *
 * The transport-specific entry points live in `./node` and `./browser`; this
 * module exports the shared, transport-agnostic pieces so they can be embedded
 * or tested directly.
 */
export { createServer } from "./server.js";
export type { CompileProvider, AnalyzeProvider } from "./server.js";
export {
  toLspDiagnostics,
  toLspSeverity,
  DIAGNOSTIC_SOURCE,
} from "./diagnostics.js";
export {
  definitionAt,
  referencesAt,
  highlightsAt,
  renameEdits,
  hoverAt,
} from "./navigation.js";
export {
  scanStructure,
  findInterpolations,
} from "./scanner.js";
export type {
  Structure,
  Block,
  BlockKind,
  Interpolation,
  Span,
} from "./scanner.js";
export {
  documentSymbols,
  foldingRanges,
  selectionRangeAt,
} from "./structure.js";
