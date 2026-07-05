/**
 * `lunas-tsc` — programmatic entry. The CLI lives in `./cli`; these exports let
 * other tools reuse the checking and formatting logic.
 */
export {
  checkSource,
  formatDiagnostic,
  summarize,
  exitCode,
} from "./check.js";
export type { LocatedDiagnostic, CheckSummary } from "./check.js";
export { findLunasFiles } from "./find-files.js";
