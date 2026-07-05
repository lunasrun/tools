// Shared helper to load the Lunas grammar into a real vscode-textmate
// registry (backed by the vscode-oniguruma WASM regex engine, the same
// engine VS Code itself uses) and tokenize source line-by-line.
//
// All paths are resolved relative to this module (import.meta.url) or via
// Node's package resolution — no absolute paths.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import oniguruma from "vscode-oniguruma";
import textmate from "vscode-textmate";
import { grammarPath, scopeName } from "../index.js";

const { loadWASM, OnigScanner, OnigString } = oniguruma;
const { Registry, parseRawGrammar, INITIAL } = textmate;

let vscodeOnigurumaLib;
async function getOnigurumaLib() {
  if (!vscodeOnigurumaLib) {
    // Resolve the onig.wasm asset shipped inside vscode-oniguruma via
    // Node's module resolution (works regardless of hoisting layout),
    // falling back to the flat pnpm hoist path used in this workspace.
    let wasmUrl;
    try {
      const resolved = await import.meta.resolve("vscode-oniguruma/release/onig.wasm");
      wasmUrl = new URL(resolved);
    } catch {
      wasmUrl = new URL(
        "../../../node_modules/vscode-oniguruma/release/onig.wasm",
        import.meta.url,
      );
    }
    const wasmBin = readFileSync(fileURLToPath(wasmUrl));
    await loadWASM(wasmBin.buffer);
    vscodeOnigurumaLib = {
      createOnigScanner(patterns) {
        return new OnigScanner(patterns);
      },
      createOnigString(s) {
        return new OnigString(s);
      },
    };
  }
  return vscodeOnigurumaLib;
}

// Real embedded-language grammars (the same JSON TextMate grammars VS Code
// ships) so ${...} / script: / style: / html: content tokenizes exactly as
// it would in the editor, not just the Lunas-specific wrapper scopes.
// Sourced from `tm-grammars` (no-dep bundle of upstream .tmLanguage.json
// files), keyed by TextMate scopeName exactly as our grammar/manifest embeds
// them: text.html.basic, source.css, source.ts (html also pulls in
// source.js internally).
const EMBEDDED_GRAMMAR_MODULES = {
  "text.html.basic": () => import("tm-grammars/grammars/html.json", { with: { type: "json" } }),
  "source.css": () => import("tm-grammars/grammars/css.json", { with: { type: "json" } }),
  "source.ts": () => import("tm-grammars/grammars/typescript.json", { with: { type: "json" } }),
  "source.js": () => import("tm-grammars/grammars/javascript.json", { with: { type: "json" } }),
};

let registryPromise;
function getRegistry() {
  if (!registryPromise) {
    registryPromise = (async () => {
      const onigLib = await getOnigurumaLib();
      const registry = new Registry({
        onigLib,
        loadGrammar: async (requestedScopeName) => {
          if (requestedScopeName === scopeName) {
            const content = readFileSync(grammarPath, "utf8");
            return parseRawGrammar(content, grammarPath);
          }
          const loader = EMBEDDED_GRAMMAR_MODULES[requestedScopeName];
          if (loader) {
            const mod = await loader();
            return mod.default;
          }
          return null;
        },
      });
      return registry;
    })();
  }
  return registryPromise;
}

/**
 * Tokenize a full source string with the Lunas grammar.
 * Returns an array of lines, each an array of { text, scopes } tokens.
 */
export async function tokenizeSource(source) {
  const registry = await getRegistry();
  const grammar = await registry.loadGrammar(scopeName);
  const lines = source.split(/\r\n|\n/);
  let ruleStack = INITIAL;
  const result = [];
  for (const line of lines) {
    const lineTokens = grammar.tokenizeLine(line, ruleStack);
    ruleStack = lineTokens.ruleStack;
    result.push(
      lineTokens.tokens.map((t) => ({
        text: line.substring(t.startIndex, t.endIndex),
        scopes: t.scopes,
      })),
    );
  }
  return result;
}

/** Flatten tokenizeSource's per-line tokens into one array with line numbers. */
export async function tokenizeToFlat(source) {
  const lines = await tokenizeSource(source);
  const flat = [];
  lines.forEach((tokens, lineIndex) => {
    for (const token of tokens) {
      flat.push({ ...token, line: lineIndex });
    }
  });
  return flat;
}

/** Find the first token whose text matches `text` (exact) and scopes include `scope`. */
export function findToken(tokens, { text, scope }) {
  return tokens.find(
    (t) =>
      (text === undefined || t.text === text) &&
      (scope === undefined || t.scopes.includes(scope)),
  );
}

/** All tokens containing a given scope. */
export function tokensWithScope(tokens, scope) {
  return tokens.filter((t) => t.scopes.includes(scope));
}
