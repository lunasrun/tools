#!/usr/bin/env node
// Copy the shared grammar assets from @lunas-tools/grammar into ./syntaxes so
// they can be packaged with the extension. The syntaxes/ dir is generated
// (git-ignored); this keeps a single source of truth for the grammar.
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { grammarPath, languageConfigurationPath } from "@lunas-tools/grammar";

const here = path.dirname(fileURLToPath(import.meta.url)); // packages/vscode/scripts
const outDir = path.resolve(here, "..", "syntaxes");
mkdirSync(outDir, { recursive: true });

const copies = [
  [grammarPath, "lunas.tmLanguage.json"],
  [languageConfigurationPath, "language-configuration.json"],
];

for (const [src, name] of copies) {
  copyFileSync(src, path.join(outDir, name));
  console.log(`synced ${name}`);
}
