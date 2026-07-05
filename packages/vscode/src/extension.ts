import * as vscode from "vscode";

/**
 * Desktop (Node) activation.
 *
 * Syntax highlighting is contributed declaratively via `package.json`
 * (`contributes.languages` / `contributes.grammars`), so it works the moment
 * the extension is installed. Launching the `lunas-ls` language client for
 * live diagnostics is tracked in the roadmap (`vscode-client-node`).
 */
export function activate(_context: vscode.ExtensionContext): void {
  console.log("Lunas extension activated (desktop).");
}

export function deactivate(): void {
  // No resources to dispose yet; the language client will be added here.
}
