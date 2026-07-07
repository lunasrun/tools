/**
 * `@lunas-tools/wasm` — the single boundary between the Lunas tooling and the
 * Rust compiler. Everything else in the workspace imports from here.
 *
 * - Types describing the compiler output ({@link Diagnostic}, {@link CompileResult}).
 * - {@link LineIndex} to map UTF-8 byte offsets to editor positions.
 * - {@link loadCompiler} to obtain the real compiler (Node target).
 */
export type {
  Severity,
  Diagnostic,
  CompileResult,
  Compile,
  SymbolKind,
  SymbolOccurrence,
  AnalyzeResult,
  Analyze,
} from "./types.js";
export { LineIndex } from "./line-index.js";
export type { Position, Range } from "./line-index.js";
export {
  loadCompiler,
  loadAnalyzer,
  isCompilerAvailable,
} from "./loader.js";
