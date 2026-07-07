/**
 * Tier 2 diagnostics: real TypeScript type errors for `.lunas` files.
 *
 * The Lunas compiler (SWC-based) parses/transforms TS but does not type-check
 * it, so type mistakes (`let x: number = "str"`, calling `.toUpperCase()` on a
 * number) go unreported. This module runs the actual TypeScript checker over a
 * **virtual** module assembled from the source — the `script:` block plus the
 * `${ … }` template expressions woven into the script's scope — and maps the
 * resulting diagnostics back to `.lunas` positions.
 *
 * Conservative by design: only a curated set of high-confidence type-error
 * codes is surfaced (never "cannot find name", which an incomplete fragment or
 * Lunas runtime magic could trip), and `@input` props are declared into the
 * virtual module so their uses don't look undefined. Pure and never throws.
 */
import ts from "typescript";
import {
  Diagnostic,
  DiagnosticSeverity,
} from "vscode-languageserver-types";
import { LineIndex } from "@lunas-tools/wasm";
import { scanStructure } from "./scanner.js";

const DIAGNOSTIC_SOURCE = "lunas";
const VIRTUAL_FILE = "__lunas_virtual__.ts";

/**
 * High-confidence type-error codes to report. Deliberately excludes
 * "cannot find name" (2304), missing-module and suggestion codes, so an
 * incomplete fragment or a Lunas-injected name never produces a false positive.
 */
const REPORTED_CODES = new Set<number>([
  2322, // Type 'X' is not assignable to type 'Y'.
  2339, // Property 'X' does not exist on type 'Y'.
  2345, // Argument of type 'X' is not assignable to parameter of type 'Y'.
  2362, // The left-hand side of an arithmetic operation must be number/bigint/enum.
  2363, // The right-hand side of an arithmetic operation must be number/bigint/enum.
  2365, // Operator 'X' cannot be applied to types 'A' and 'B'.
  2367, // This comparison appears unintentional (incompatible types).
  2551, // Property 'X' does not exist ... Did you mean 'Y'?
  2554, // Expected N arguments, but got M.
  2769, // No overload matches this call.
]);

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  lib: ["lib.es2020.d.ts", "lib.dom.d.ts"],
  noEmit: true,
  // Lenient — keep assignability/property checks, drop the noisy strict lints
  // (implicit-any, null-checks) that a template-derived fragment would trip.
  noImplicitAny: false,
  strictNullChecks: false,
  skipLibCheck: true,
};

/** A stretch of the virtual file that maps back to a source (UTF-16) offset. */
interface Segment {
  virtualStart: number;
  length: number;
  sourceStart: number;
}

const INPUT_RE =
  /^[ \t]*@input[ \t]+([A-Za-z_$][\w$]*)[ \t]*(?::[ \t]*([^=\n]+?))?[ \t]*(?:=.*)?$/gm;

/** Collect `@input` props as `name: type` parameter fragments (deduped). */
function inputParams(source: string): string[] {
  const seen = new Map<string, string>();
  for (const m of source.matchAll(INPUT_RE)) {
    const name = m[1];
    const type = m[2]?.trim().replace(/\?$/, "") || "any";
    if (!seen.has(name)) seen.set(name, `${name}: ${type}`);
  }
  return [...seen.values()];
}

/**
 * Assemble the virtual TS module and the segment map back to the source.
 *
 * The script and template expressions are wrapped in a single function whose
 * parameters are the `@input` props: locals cleanly shadow DOM globals (e.g. a
 * prop named `name`, which the DOM lib declares as `void`), and the props are in
 * scope for both. A top-level `import` inside the wrapper is a *syntactic* error
 * (which we never report — only semantic diagnostics are surfaced), so the rest
 * of such a script still type-checks.
 */
function buildVirtual(
  source: string,
): { text: string; segments: Segment[] } | null {
  const { blocks } = scanStructure(source);
  const scriptBlock = blocks.find((b) => b.kind === "script");
  const htmlBlock = blocks.find((b) => b.kind === "html");
  const interpolations = htmlBlock?.interpolations ?? [];
  if (!scriptBlock && interpolations.length === 0) return null;

  let text = "";
  const segments: Segment[] = [];
  const append = (s: string) => {
    text += s;
  };
  const appendMapped = (s: string, sourceStart: number) => {
    segments.push({ virtualStart: text.length, length: s.length, sourceStart });
    text += s;
  };

  append(`function __lunas_scope__(${inputParams(source).join(", ")}) {\n`);

  if (scriptBlock) {
    appendMapped(
      source.slice(scriptBlock.bodySpan.start, scriptBlock.bodySpan.end),
      scriptBlock.bodySpan.start,
    );
    append("\n");
  }

  // Weave the `${ … }` expressions into the script's scope so template type
  // errors surface. Each is checked as a `void` statement, which accepts any
  // expression and needs no value.
  if (interpolations.length > 0) {
    append(";(() => {\n");
    for (const interp of interpolations) {
      const expr = source.slice(interp.inner.start, interp.inner.end);
      if (expr.trim() === "") continue;
      append("void (");
      appendMapped(expr, interp.inner.start);
      append(");\n");
    }
    append("})();\n");
  }

  append("}\n");
  return { text, segments };
}

// A persistent LanguageService + DocumentRegistry keeps the large `lib.*.d.ts`
// ASTs parsed once and reused across checks (they never change), so each
// keystroke only re-parses the small virtual file rather than rebuilding the
// whole program — the dominant cost. The service is a Node-only singleton (it
// reads lib files from disk via `ts.sys`); the LS runs single-threaded, so
// mutating the current-file state between calls is safe.
let service: ts.LanguageService | null = null;
let serviceUnavailable = false;
let currentText = "";
let version = 0;

function getService(): ts.LanguageService | null {
  if (service) return service;
  if (serviceUnavailable || !ts.sys) {
    serviceUnavailable = true; // no filesystem (e.g. browser) — disable Tier 2
    return null;
  }
  const sys = ts.sys;
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [VIRTUAL_FILE],
    getScriptVersion: (f) => (f === VIRTUAL_FILE ? String(version) : "1"),
    getScriptSnapshot: (f) => {
      const text = f === VIRTUAL_FILE ? currentText : sys.readFile(f);
      return text === undefined
        ? undefined
        : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => "",
    getCompilationSettings: () => COMPILER_OPTIONS,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: sys.fileExists,
    readFile: sys.readFile,
    readDirectory: sys.readDirectory,
    directoryExists: sys.directoryExists,
    getDirectories: sys.getDirectories,
  };
  service = ts.createLanguageService(host, ts.createDocumentRegistry());
  return service;
}

/** Run the TS semantic checker over the virtual module (reusing cached libs). */
function checkVirtual(text: string): readonly ts.Diagnostic[] {
  const svc = getService();
  if (!svc) return [];
  currentText = text;
  version += 1;
  return svc.getSemanticDiagnostics(VIRTUAL_FILE);
}

/** Map a virtual-file offset to a source (UTF-16) offset via the segments. */
function toSourceOffset(segments: Segment[], virtualOffset: number): number | null {
  for (const seg of segments) {
    if (
      virtualOffset >= seg.virtualStart &&
      virtualOffset <= seg.virtualStart + seg.length
    ) {
      return seg.sourceStart + (virtualOffset - seg.virtualStart);
    }
  }
  return null; // in prelude / IIFE boilerplate — not a real source location
}

/**
 * Type-check a `.lunas` source and return TypeScript diagnostics for the script
 * and template expressions, positioned in the original file. Never throws.
 */
export function typeDiagnostics(source: string): Diagnostic[] {
  try {
    const built = buildVirtual(source);
    if (!built) return [];
    const index = new LineIndex(source);
    const out: Diagnostic[] = [];

    for (const d of checkVirtual(built.text)) {
      if (d.file?.fileName !== VIRTUAL_FILE) continue;
      if (typeof d.start !== "number") continue;
      if (!REPORTED_CODES.has(d.code)) continue;

      const startSrc = toSourceOffset(built.segments, d.start);
      if (startSrc === null) continue; // originates in synthetic code — skip
      const endSrc =
        toSourceOffset(built.segments, d.start + (d.length ?? 0)) ??
        startSrc + (d.length ?? 0);

      out.push({
        range: {
          start: index.positionU16At(startSrc),
          end: index.positionU16At(endSrc),
        },
        severity:
          d.category === ts.DiagnosticCategory.Warning
            ? DiagnosticSeverity.Warning
            : DiagnosticSeverity.Error,
        source: DIAGNOSTIC_SOURCE,
        code: d.code,
        message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
      });
    }
    return out;
  } catch {
    return [];
  }
}
