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
export { runCheck, summaryLine } from "./run.js";
export type { CheckRun } from "./run.js";
export { startWatch, fsWatchFactory } from "./watch.js";
export type {
  WatchSession,
  WatchOptions,
  WatchFactory,
  Watcher,
} from "./watch.js";
