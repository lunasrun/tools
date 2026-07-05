import { watch as fsWatch, statSync } from "node:fs";
import type { Compile } from "@lunas-tools/wasm";
import { runCheck, type CheckRun } from "./run.js";

/** A minimal filesystem watcher handle (the subset `startWatch` needs). */
export interface Watcher {
  close(): void;
}

/**
 * Creates a watcher for `path` that invokes `onChange` on any change beneath it.
 * Injectable so the watch loop can be tested without touching the filesystem.
 */
export type WatchFactory = (path: string, onChange: () => void) => Watcher | null;

/** Default factory: `fs.watch`, recursive for directories (Node ≥ 20). */
export const fsWatchFactory: WatchFactory = (path, onChange) => {
  try {
    const recursive = statSync(path).isDirectory();
    return fsWatch(path, { recursive }, () => onChange());
  } catch {
    // A missing/unwatchable path is skipped, matching findLunasFiles' leniency.
    return null;
  }
};

export interface WatchOptions {
  /** Coalesce bursts of change events within this window (ms). */
  debounceMs?: number;
  /** Watcher factory (defaults to {@link fsWatchFactory}); injected in tests. */
  watchFactory?: WatchFactory;
  /** Clock, injectable for tests (defaults to the real `Date`). */
  now?: () => Date;
}

/** A running watch session: re-check on demand, or stop watching. */
export interface WatchSession {
  runNow(): CheckRun;
  close(): void;
}

/**
 * Watch `inputs` and re-run {@link runCheck} on every (debounced) change,
 * writing a timestamped report through `out`. Runs one pass immediately, then
 * watches each input path. Returns a session that can force a run or stop.
 */
export function startWatch(
  compile: Compile,
  inputs: string[],
  out: (text: string) => void,
  options: WatchOptions = {},
): WatchSession {
  const debounceMs = options.debounceMs ?? 80;
  const watchFactory = options.watchFactory ?? fsWatchFactory;
  const now = options.now ?? (() => new Date());

  const runAndReport = (): CheckRun => {
    const run = runCheck(compile, inputs);
    const stamp = now().toLocaleTimeString();
    out(`[${stamp}] ${run.lines.join("\n")}\n`);
    return run;
  };

  // Initial pass.
  runAndReport();

  let timer: ReturnType<typeof setTimeout> | null = null;
  const onChange = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      runAndReport();
    }, debounceMs);
  };

  const watchers = inputs
    .map((input) => watchFactory(input, onChange))
    .filter((w): w is Watcher => w !== null);

  return {
    runNow: runAndReport,
    close() {
      if (timer) clearTimeout(timer);
      for (const w of watchers) w.close();
    },
  };
}
