import { createRequire } from "node:module";
import * as vscode from "vscode";
import {
  LanguageClient,
  TransportKind,
  type LanguageClientOptions,
  type ServerOptions,
} from "vscode-languageclient/node";

// `require` isn't available in ESM by default. The extension is authored as
// ESM (see package.json's "type": "module") and bundled to CommonJS for the
// Node host by esbuild, so synthesize a `require` via `createRequire` rather
// than depending on the ambient CJS `require` global.
const require = createRequire(import.meta.url);

let client: LanguageClient | undefined;

/**
 * Desktop (Node) activation.
 *
 * Syntax highlighting is contributed declaratively via `package.json`
 * (`contributes.languages` / `contributes.grammars`), so it works the moment
 * the extension is installed. This launches the `lunas-ls` language server as
 * a Node child process (stdio over IPC) for diagnostics + navigation
 * (definition/references/highlight/rename/hover, documentSymbol/folding/
 * selectionRange).
 */
export function activate(_context: vscode.ExtensionContext): void {
  console.log("Lunas extension activated (desktop).");

  const serverModule = require.resolve("lunas-ls/node");

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "lunas" }],
  };

  client = new LanguageClient(
    "lunas-ls",
    "Lunas Language Server",
    serverOptions,
    clientOptions,
  );

  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
