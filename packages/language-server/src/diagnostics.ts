import {
  Diagnostic,
  DiagnosticSeverity,
} from "vscode-languageserver-types";
import {
  LineIndex,
  type CompileResult,
  type Severity,
} from "@lunas-tools/wasm";

/** The diagnostic `source` label shown in editors. */
export const DIAGNOSTIC_SOURCE = "lunas";

/** Map a compiler severity to the LSP {@link DiagnosticSeverity} enum. */
export function toLspSeverity(severity: Severity): DiagnosticSeverity {
  switch (severity) {
    case "error":
      return DiagnosticSeverity.Error;
    case "warning":
      return DiagnosticSeverity.Warning;
    case "hint":
      return DiagnosticSeverity.Hint;
  }
}

/**
 * Convert a compiler {@link CompileResult} into LSP diagnostics for `source`.
 *
 * The compiler reports UTF-8 byte offsets; {@link LineIndex} turns them into the
 * line/character ranges the LSP expects. Pure and synchronous — this is the
 * unit under test, independent of any transport or the real compiler.
 */
export function toLspDiagnostics(
  source: string,
  result: CompileResult,
): Diagnostic[] {
  const index = new LineIndex(source);
  return result.diagnostics.map((d) => ({
    range: index.rangeAt(d.start, d.end),
    severity: toLspSeverity(d.severity),
    source: DIAGNOSTIC_SOURCE,
    message: d.message,
  }));
}
