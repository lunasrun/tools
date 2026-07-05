#!/usr/bin/env node
import { createConnection, ProposedFeatures } from "vscode-languageserver/node";
import {
  loadCompiler,
  isCompilerAvailable,
  type Compile,
} from "@lunas-tools/wasm";
import { createServer } from "./server.js";

// Node entry: LSP over stdio, backed by the real (wasm) compiler.
const connection = createConnection(ProposedFeatures.all);

let compile: Compile | null = null;
try {
  if (isCompilerAvailable()) {
    compile = loadCompiler();
  } else {
    connection.console.warn(
      "Lunas compiler bindings not built; diagnostics disabled. Run `pnpm wasm:build`.",
    );
  }
} catch (err) {
  connection.console.error(`Failed to load Lunas compiler: ${String(err)}`);
}

createServer(connection, () => compile);
