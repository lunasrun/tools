import {
  type Connection,
  TextDocuments,
  TextDocumentSyncKind,
  type InitializeResult,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { Compile } from "@lunas-tools/wasm";
import { toLspDiagnostics } from "./diagnostics.js";

/**
 * Supplies the compiler lazily. Returns `null` when no compiler is available
 * yet (e.g. the browser build before the wasm module has loaded), in which case
 * the server stays up but publishes no diagnostics.
 */
export type CompileProvider = () => Compile | null;

/**
 * Wire the transport-agnostic Lunas language server onto a connection.
 *
 * The connection (stdio in Node, a web worker in the browser) and the compiler
 * are both injected, which keeps this core testable and shared across builds.
 */
export function createServer(
  connection: Connection,
  getCompile: CompileProvider,
): void {
  const documents = new TextDocuments(TextDocument);

  connection.onInitialize(
    (): InitializeResult => ({
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Full,
      },
    }),
  );

  const validate = (document: TextDocument): void => {
    const compile = getCompile();
    if (!compile) return;

    const text = document.getText();
    try {
      const result = compile(text);
      connection.sendDiagnostics({
        uri: document.uri,
        diagnostics: toLspDiagnostics(text, result),
      });
    } catch (err) {
      connection.console.error(`lunas compile failed: ${String(err)}`);
    }
  };

  documents.onDidChangeContent((event) => validate(event.document));
  documents.onDidClose((event) =>
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] }),
  );

  documents.listen(connection);
  connection.listen();
}
