import { readFileSync } from "node:fs";
import type { Compile } from "@lunas-tools/wasm";
import {
  checkSource,
  formatDiagnostic,
  summarize,
  exitCode,
  type CheckSummary,
  type LocatedDiagnostic,
} from "./check.js";
import { findLunasFiles } from "./find-files.js";

/** The outcome of one check pass over a set of input paths. */
export interface CheckRun {
  /** The `.lunas` files that were checked (sorted, de-duplicated). */
  files: string[];
  diagnostics: LocatedDiagnostic[];
  summary: CheckSummary;
  /** Human-readable output lines: one per diagnostic, then a summary line. */
  lines: string[];
  /** Process exit code for this run (non-zero when there were errors). */
  code: number;
}

/** Format the trailing summary line, e.g. `Checked 2 file(s): 1 error(s), …`. */
export function summaryLine(summary: CheckSummary): string {
  return (
    `Checked ${summary.files} file(s): ${summary.errors} error(s), ` +
    `${summary.warnings} warning(s), ${summary.hints} hint(s).`
  );
}

/**
 * Resolve `inputs` to `.lunas` files, compile each, and collect located
 * diagnostics plus a formatted report. Pure over the filesystem + injected
 * compiler — the CLI and the watcher both build on this.
 */
export function runCheck(compile: Compile, inputs: string[]): CheckRun {
  const files = findLunasFiles(inputs);
  const diagnostics: LocatedDiagnostic[] = [];
  const lines: string[] = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const fileDiagnostics = checkSource(compile, file, source);
    for (const d of fileDiagnostics) lines.push(formatDiagnostic(d));
    diagnostics.push(...fileDiagnostics);
  }

  const summary = summarize(diagnostics, files.length);
  lines.push(summaryLine(summary));

  return { files, diagnostics, summary, lines, code: exitCode(summary) };
}
