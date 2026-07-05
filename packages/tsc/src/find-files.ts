import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const LUNAS_EXT = ".lunas";
const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "out"]);

/**
 * Expand input paths into a sorted, de-duplicated list of `.lunas` files.
 * Directories are walked recursively (skipping `node_modules`/`.git`/build
 * dirs); files are included as-is when they end in `.lunas`.
 */
export function findLunasFiles(inputs: string[]): string[] {
  const found = new Set<string>();

  const walk = (target: string): void => {
    let stat;
    try {
      stat = statSync(target);
    } catch {
      return; // ignore missing paths; the CLI reports them separately
    }
    if (stat.isFile()) {
      if (target.endsWith(LUNAS_EXT)) found.add(path.normalize(target));
      return;
    }
    if (!stat.isDirectory()) return;
    for (const entry of readdirSync(target, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        walk(path.join(target, entry.name));
      } else if (entry.isFile() && entry.name.endsWith(LUNAS_EXT)) {
        found.add(path.normalize(path.join(target, entry.name)));
      }
    }
  };

  for (const input of inputs) walk(input);
  return [...found].sort();
}
