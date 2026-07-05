import {
  LineIndex,
  type Compile,
  type Severity,
} from "@lunas-tools/wasm";

/** A diagnostic located in a file, with 1-based line/column for display. */
export interface LocatedDiagnostic {
  path: string;
  /** 1-based line number. */
  line: number;
  /** 1-based column (UTF-16 units). */
  column: number;
  severity: Severity;
  message: string;
}

/** Compile one file's source and return its diagnostics, located for display. */
export function checkSource(
  compile: Compile,
  path: string,
  source: string,
): LocatedDiagnostic[] {
  const result = compile(source);
  const index = new LineIndex(source);
  return result.diagnostics.map((d) => {
    const pos = index.positionAt(d.start);
    return {
      path,
      line: pos.line + 1,
      column: pos.character + 1,
      severity: d.severity,
      message: d.message,
    };
  });
}

/** Format one diagnostic as `path:line:col - severity: message`. */
export function formatDiagnostic(d: LocatedDiagnostic): string {
  return `${d.path}:${d.line}:${d.column} - ${d.severity}: ${d.message}`;
}

/** Aggregate counts across a check run. */
export interface CheckSummary {
  files: number;
  errors: number;
  warnings: number;
  hints: number;
}

/** Tally diagnostics by severity for `fileCount` checked files. */
export function summarize(
  diagnostics: LocatedDiagnostic[],
  fileCount: number,
): CheckSummary {
  const summary: CheckSummary = {
    files: fileCount,
    errors: 0,
    warnings: 0,
    hints: 0,
  };
  for (const d of diagnostics) {
    if (d.severity === "error") summary.errors += 1;
    else if (d.severity === "warning") summary.warnings += 1;
    else summary.hints += 1;
  }
  return summary;
}

/** Process exit code: non-zero when any error was reported. */
export function exitCode(summary: CheckSummary): number {
  return summary.errors > 0 ? 1 : 0;
}
