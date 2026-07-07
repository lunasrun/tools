#!/usr/bin/env node
import { createConnection, ProposedFeatures } from "vscode-languageserver/node";
import {
  loadCompiler,
  loadAnalyzer,
  isCompilerAvailable,
  type Analyze,
  type Compile,
} from "@lunas-tools/wasm";
import { createServer } from "./server.js";

// Node entry: LSP over stdio, backed by the real (wasm) compiler + analyzer.
const connection = createConnection(ProposedFeatures.all);

let compile: Compile | null = null;
let analyze: Analyze | null = null;
try {
  if (isCompilerAvailable()) {
    compile = loadCompiler();
    analyze = loadAnalyzer();
  } else {
    connection.console.warn(
      "Lunas compiler bindings not built; diagnostics and navigation disabled. Run `pnpm wasm:build`.",
    );
  }
} catch (err) {
  connection.console.error(`Failed to load Lunas compiler: ${String(err)}`);
}

createServer(
  connection,
  () => compile,
  () => analyze,
);
