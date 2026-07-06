/**
 * Semantic tokens from the compiler's `analyze` output: colour every known
 * symbol (script bindings, `@input` props, `@use`/`<Component/>` components,
 * `:for` variables and their uses) by its `kind`, on top of the TextMate
 * grammar. Pure and transport-agnostic — the delta encoding is built here so it
 * unit-tests without a server or the wasm binary.
 */
import { LineIndex, type AnalyzeResult, type SymbolOccurrence } from "@lunas-tools/wasm";

/** The token-type legend (indices are referenced by the encoded data). */
export const SEMANTIC_TOKEN_TYPES = ["variable", "property", "class"] as const;
/** The token-modifier legend. */
export const SEMANTIC_TOKEN_MODIFIERS = ["declaration"] as const;

/** Map an `analyze` symbol `kind` to a {@link SEMANTIC_TOKEN_TYPES} index. */
const KIND_TO_TYPE: Record<string, number> = {
  variable: 0,
  prop: 1,
  component: 2,
};
const DECLARATION_BIT = 1 << 0;

interface Token {
  line: number;
  char: number;
  length: number;
  type: number;
  modifiers: number;
}

/**
 * Build the LSP semantic-tokens `data` array — flat 5-tuples
 * `(deltaLine, deltaStartChar, length, tokenType, tokenModifiers)`, sorted by
 * position and delta-encoded.
 */
export function buildSemanticTokens(
  source: string,
  analysis: AnalyzeResult,
): { data: number[] } {
  const index = new LineIndex(source);

  // A reference should colour like what it resolves to: a use of an `@input`
  // prop reads as a property, a `<Component/>` as a class. Look up the
  // declaration's kind by name, falling back to the reference's own kind.
  const bindingKind = new Map<string, string>();
  for (const b of analysis.bindings) bindingKind.set(b.name, b.kind);

  const tokens: Token[] = [];
  const add = (occ: SymbolOccurrence, kind: string, declaration: boolean) => {
    const pos = index.positionAt(occ.start);
    tokens.push({
      line: pos.line,
      char: pos.character,
      length: occ.name.length,
      type: KIND_TO_TYPE[kind] ?? 0,
      modifiers: declaration ? DECLARATION_BIT : 0,
    });
  };

  for (const b of analysis.bindings) add(b, b.kind, true);
  for (const r of analysis.references) add(r, bindingKind.get(r.name) ?? r.kind, false);

  tokens.sort((a, b) => a.line - b.line || a.char - b.char);

  const data: number[] = [];
  let prevLine = 0;
  let prevChar = 0;
  for (const t of tokens) {
    const deltaLine = t.line - prevLine;
    const deltaChar = deltaLine === 0 ? t.char - prevChar : t.char;
    data.push(deltaLine, deltaChar, t.length, t.type, t.modifiers);
    prevLine = t.line;
    prevChar = t.char;
  }
  return { data };
}
