import * as vscode from "vscode";

/**
 * Web (browser) activation for vscode.dev / github.dev.
 *
 * The grammar is contributed declaratively and works in the web host as-is.
 * Running `lunas-ls` as a web worker is tracked in the roadmap
 * (`vscode-client-web`).
 */
export function activate(_context: vscode.ExtensionContext): void {
  console.log("Lunas extension activated (web).");
}

export function deactivate(): void {
  // No resources to dispose yet; the web-worker language client goes here.
}
