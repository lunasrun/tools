import {
  type Connection,
  TextDocuments,
  TextDocumentSyncKind,
  type InitializeResult,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { Compile } from "@lunas-tools/wasm";
import { toLspDiagnostics } from "./diagnostics.js";
import {
  documentSymbols,
  foldingRanges,
  selectionRangeAt,
} from "./structure.js";

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
 *
 * Diagnostics need the compiler; the structural features (document symbols,
 * folding, selection ranges) are derived from a pure TS-side scan of the
 * `.lunas` source and therefore work even when no compiler is available.
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
        documentSymbolProvider: true,
        foldingRangeProvider: true,
        selectionRangeProvider: true,
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

  connection.onDocumentSymbol((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    return documentSymbols(document.getText());
  });

  connection.onFoldingRanges((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    return foldingRanges(document.getText());
  });

  connection.onSelectionRanges((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    const text = document.getText();
    return params.positions.map((position) => selectionRangeAt(text, position));
  });

  documents.listen(connection);
  connection.listen();
}
