/**
 * Tier 1 "smart" diagnostics derived from the compiler's `analyze` output —
 * undefined references and unknown components. These complement the parse/
 * structure diagnostics from `compile`; they are computed purely on the LS side
 * from the existing `analyze` result (no new wasm export).
 *
 * The analysis gives `bindings` (script decls, `@input` props, `@use`
 * components, `:for` variables) and `references` (template-expression free
 * identifiers, `<Component/>` tag uses, `:for` iterables) as UTF-8 byte ranges;
 * {@link LineIndex} maps those to LSP positions.
 *
 * Conservative by design — zero false positives is the priority. A reference is
 * only flagged when its name matches no binding AND (for non-components) is not
 * a known JavaScript/DOM global. Pure, total, and must never throw.
 */
import {
  Diagnostic,
  DiagnosticSeverity,
} from "vscode-languageserver-types";
import {
  LineIndex,
  type AnalyzeResult,
  type SymbolOccurrence,
} from "@lunas-tools/wasm";

/** The diagnostic `source` label shown in editors (matches `toLspDiagnostics`). */
const DIAGNOSTIC_SOURCE = "lunas";

/**
 * Identifiers that resolve to a global at runtime, so a reference to one is
 * never "undefined". Case-sensitive. Intentionally broad to avoid false
 * positives — better to miss a real error than to flag valid code.
 */
const KNOWN_GLOBALS = new Set<string>([
  "window",
  "document",
  "globalThis",
  "console",
  "Math",
  "JSON",
  "Number",
  "String",
  "Array",
  "Object",
  "Boolean",
  "Date",
  "RegExp",
  "Error",
  "Promise",
  "Map",
  "Set",
  "Symbol",
  "Function",
  "BigInt",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "encodeURIComponent",
  "decodeURIComponent",
  "NaN",
  "Infinity",
  "undefined",
  "null",
  "true",
  "false",
  "this",
  "event",
  "navigator",
  "location",
  "history",
  "localStorage",
  "sessionStorage",
  "fetch",
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "requestAnimationFrame",
  "structuredClone",
]);

/**
 * Compute semantic diagnostics for a `.lunas` source from its `analyze` result.
 *
 * For every reference that resolves to no binding: a `"component"` reference is
 * an unknown component (not declared with `@use`); any other reference that is
 * also not a known global is an undefined reference. Everything else is left
 * alone. Pure and total — returns `[]` rather than throwing on any input.
 */
export function semanticDiagnostics(
  source: string,
  analysis: AnalyzeResult,
): Diagnostic[] {
  try {
    const bound = new Set((analysis.bindings ?? []).map((b) => b.name));
    const index = new LineIndex(source);
    const diagnostics: Diagnostic[] = [];

    for (const ref of analysis.references ?? []) {
      // Resolved to some binding (script decl, @input, @use, or :for var).
      if (bound.has(ref.name)) continue;

      if (ref.kind === "component") {
        diagnostics.push(
          diagnostic(
            index,
            ref,
            `Unknown component <${ref.name}/> — is it declared with @use?`,
            "unknown-component",
          ),
        );
        continue;
      }

      // A known global is always defined at runtime.
      if (KNOWN_GLOBALS.has(ref.name)) continue;

      diagnostics.push(
        diagnostic(
          index,
          ref,
          `'${ref.name}' is not defined`,
          "undefined-reference",
        ),
      );
    }

    return diagnostics;
  } catch {
    // Total by contract: never throw, whatever the analysis or source contains.
    return [];
  }
}

/** Build one Warning-level LSP diagnostic for a reference occurrence. */
function diagnostic(
  index: LineIndex,
  ref: SymbolOccurrence,
  message: string,
  code: string,
): Diagnostic {
  return {
    range: index.rangeAt(ref.start, ref.end),
    severity: DiagnosticSeverity.Warning,
    source: DIAGNOSTIC_SOURCE,
    code,
    message,
  };
}
