import {
  type Connection,
  TextDocuments,
  TextDocumentSyncKind,
  type InitializeResult,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { Analyze, Compile } from "@lunas-tools/wasm";
import { toLspDiagnostics } from "./diagnostics.js";
import { semanticDiagnostics } from "./semantic-diagnostics.js";
import {
  documentSymbols,
  foldingRanges,
  selectionRangeAt,
} from "./structure.js";
import {
  definitionAt,
  referencesAt,
  highlightsAt,
  renameEdits,
  hoverAt,
} from "./navigation.js";
import {
  buildSemanticTokens,
  SEMANTIC_TOKEN_TYPES,
  SEMANTIC_TOKEN_MODIFIERS,
} from "./semantic-tokens.js";

/**
 * Supplies the compiler lazily. Returns `null` when no compiler is available
 * yet (e.g. the browser build before the wasm module has loaded), in which case
 * the server stays up but publishes no diagnostics.
 */
export type CompileProvider = () => Compile | null;

/**
 * Supplies the analyzer lazily. Returns `null` when navigation data isn't
 * available (no analyzer wired), in which case navigation requests resolve empty
 * while diagnostics and the structural features keep working.
 */
export type AnalyzeProvider = () => Analyze | null;

/**
 * Wire the transport-agnostic Lunas language server onto a connection.
 *
 * The connection (stdio in Node, a web worker in the browser) and the compiler
 * are both injected, which keeps this core testable and shared across builds.
 *
 * Diagnostics need the compiler and navigation needs the analyzer; the
 * structural features (document symbols, folding, selection ranges) are derived
 * from a pure TS-side scan and work even when neither is available.
 */
export function createServer(
  connection: Connection,
  getCompile: CompileProvider,
  getAnalyze: AnalyzeProvider = () => null,
): void {
  const documents = new TextDocuments(TextDocument);

  connection.onInitialize(
    (): InitializeResult => ({
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Full,
        documentSymbolProvider: true,
        foldingRangeProvider: true,
        selectionRangeProvider: true,
        definitionProvider: true,
        referencesProvider: true,
        documentHighlightProvider: true,
        renameProvider: true,
        hoverProvider: true,
        semanticTokensProvider: {
          legend: {
            tokenTypes: [...SEMANTIC_TOKEN_TYPES],
            tokenModifiers: [...SEMANTIC_TOKEN_MODIFIERS],
          },
          full: true,
        },
      },
    }),
  );

  /**
   * Analyze a document, or `null` when no analyzer is wired or analysis throws.
   * Navigation handlers use this and resolve empty when it returns `null`.
   */
  const analyzeDoc = (document: TextDocument) => {
    const analyze = getAnalyze();
    if (!analyze) return null;
    try {
      return analyze(document.getText());
    } catch (err) {
      connection.console.error(`lunas analyze failed: ${String(err)}`);
      return null;
    }
  };

  const validate = (document: TextDocument): void => {
    const compile = getCompile();
    if (!compile) return;

    const text = document.getText();
    try {
      const result = compile(text);
      const diagnostics = toLspDiagnostics(text, result);

      // Merge in the analyzer-derived semantic diagnostics (undefined refs,
      // unknown components) when an analyzer is wired. `analyzeDoc` returns
      // `null` — and `semanticDiagnostics` never throws — so the compile
      // diagnostics keep flowing unchanged if analysis is unavailable.
      const analysis = analyzeDoc(document);
      if (analysis) {
        diagnostics.push(...semanticDiagnostics(text, analysis));
      }

      connection.sendDiagnostics({ uri: document.uri, diagnostics });
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

  connection.onDefinition((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    const analysis = analyzeDoc(document);
    if (!analysis) return null;
    return definitionAt(
      document.uri,
      document.getText(),
      analysis,
      params.position,
    );
  });

  connection.onReferences((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    const analysis = analyzeDoc(document);
    if (!analysis) return null;
    return referencesAt(
      document.uri,
      document.getText(),
      analysis,
      params.position,
      params.context.includeDeclaration,
    );
  });

  connection.onDocumentHighlight((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    const analysis = analyzeDoc(document);
    if (!analysis) return null;
    return highlightsAt(document.getText(), analysis, params.position);
  });

  connection.onRenameRequest((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    const analysis = analyzeDoc(document);
    if (!analysis) return null;
    return renameEdits(
      document.uri,
      document.getText(),
      analysis,
      params.position,
      params.newName,
    );
  });

  connection.onHover((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;
    const analysis = analyzeDoc(document);
    if (!analysis) return null;
    return hoverAt(document.getText(), analysis, params.position);
  });

  connection.languages.semanticTokens.on((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return { data: [] };
    const analysis = analyzeDoc(document);
    if (!analysis) return { data: [] };
    return buildSemanticTokens(document.getText(), analysis);
  });

  documents.listen(connection);
  connection.listen();
}
