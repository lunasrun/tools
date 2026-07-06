/**
 * Navigation features derived from the compiler's `analyze` output: go-to-
 * definition, find-references, document highlight, rename and hover.
 *
 * The analysis gives `bindings` (declarations in `script:`) and `references`
 * (identifier uses in template expressions) as UTF-8 byte ranges; {@link
 * LineIndex} maps those to LSP positions. A reference is a use of a binding when
 * their names match — the linking the compiler's free-identifier analysis makes
 * sound (a shadowing local of the same name is not reported as a reference).
 *
 * Pure and transport-agnostic: every function takes the source + analysis and a
 * position (and a `uri` where the LSP result needs one), so they unit-test
 * without a server or the wasm binary.
 */
import {
  DocumentHighlightKind,
  MarkupKind,
  type DocumentHighlight,
  type Hover,
  type Location,
  type Position,
  type Range,
  type TextEdit,
  type WorkspaceEdit,
} from "vscode-languageserver-types";
import { LineIndex, type AnalyzeResult } from "@lunas-tools/wasm";

type OccurrenceKind = "declaration" | "reference";

interface Occurrence {
  name: string;
  kind: OccurrenceKind;
  range: Range;
}

// A top-level `@input <name>` prop declaration, e.g. `@input name: string?`.
// The `analyze` binding only reports `script:` bindings, so `@input` props —
// which are declarations too, and are referenced from the template — are
// scanned here so navigation can resolve them. Indices are UTF-16 (JS string
// offsets), mapped with `positionU16At` rather than the byte-based `rangeAt`.
const INPUT_DECL = /^[ \t]*@input[ \t]+([A-Za-z_$][\w$]*)/gm;

/** Positioned declaration occurrences for every top-level `@input` prop. */
function inputDeclarations(source: string, index: LineIndex): Occurrence[] {
  const occ: Occurrence[] = [];
  for (const m of source.matchAll(INPUT_DECL)) {
    const name = m[1];
    const start = (m.index ?? 0) + m[0].length - name.length;
    occ.push({
      name,
      kind: "declaration",
      range: {
        start: index.positionU16At(start),
        end: index.positionU16At(start + name.length),
      },
    });
  }
  return occ;
}

/** Map the analysis' byte ranges to positioned declaration/reference occurrences. */
function buildOccurrences(source: string, analysis: AnalyzeResult): Occurrence[] {
  const index = new LineIndex(source);
  const occ: Occurrence[] = inputDeclarations(source, index);
  for (const b of analysis.bindings) {
    occ.push({ name: b.name, kind: "declaration", range: index.rangeAt(b.start, b.end) });
  }
  for (const r of analysis.references) {
    occ.push({ name: r.name, kind: "reference", range: index.rangeAt(r.start, r.end) });
  }
  return occ;
}

/** True when `a` is at or before `b`. */
function lte(a: Position, b: Position): boolean {
  return a.line < b.line || (a.line === b.line && a.character <= b.character);
}

/** True when `position` falls within `[range.start, range.end]` (inclusive). */
function contains(range: Range, position: Position): boolean {
  return lte(range.start, position) && lte(position, range.end);
}

/** The occurrence under `position`, if any (declarations take precedence). */
function occurrenceAt(
  occurrences: Occurrence[],
  position: Position,
): Occurrence | undefined {
  const hits = occurrences.filter((o) => contains(o.range, position));
  return hits.find((o) => o.kind === "declaration") ?? hits[0];
}

/** Go-to-definition: the declaration site(s) of the symbol under the cursor. */
export function definitionAt(
  uri: string,
  source: string,
  analysis: AnalyzeResult,
  position: Position,
): Location[] {
  const occurrences = buildOccurrences(source, analysis);
  const target = occurrenceAt(occurrences, position);
  if (!target) return [];
  return occurrences
    .filter((o) => o.kind === "declaration" && o.name === target.name)
    .map((o) => ({ uri, range: o.range }));
}

/** Find-references: every use of the symbol under the cursor. */
export function referencesAt(
  uri: string,
  source: string,
  analysis: AnalyzeResult,
  position: Position,
  includeDeclaration: boolean,
): Location[] {
  const occurrences = buildOccurrences(source, analysis);
  const target = occurrenceAt(occurrences, position);
  if (!target) return [];
  return occurrences
    .filter(
      (o) =>
        o.name === target.name &&
        (includeDeclaration || o.kind !== "declaration"),
    )
    .map((o) => ({ uri, range: o.range }));
}

/** Document highlight: same-name occurrences, tagged read (use) vs write (decl). */
export function highlightsAt(
  source: string,
  analysis: AnalyzeResult,
  position: Position,
): DocumentHighlight[] {
  const occurrences = buildOccurrences(source, analysis);
  const target = occurrenceAt(occurrences, position);
  if (!target) return [];
  return occurrences
    .filter((o) => o.name === target.name)
    .map((o) => ({
      range: o.range,
      kind:
        o.kind === "declaration"
          ? DocumentHighlightKind.Write
          : DocumentHighlightKind.Read,
    }));
}

/** Rename: edits over the declaration and every reference of the symbol. */
export function renameEdits(
  uri: string,
  source: string,
  analysis: AnalyzeResult,
  position: Position,
  newName: string,
): WorkspaceEdit | null {
  const occurrences = buildOccurrences(source, analysis);
  const target = occurrenceAt(occurrences, position);
  if (!target) return null;
  const edits: TextEdit[] = occurrences
    .filter((o) => o.name === target.name)
    .map((o) => ({ range: o.range, newText: newName }));
  return { changes: { [uri]: edits } };
}

/** Hover: a short label identifying the symbol under the cursor. */
export function hoverAt(
  source: string,
  analysis: AnalyzeResult,
  position: Position,
): Hover | null {
  const occurrences = buildOccurrences(source, analysis);
  const target = occurrenceAt(occurrences, position);
  if (!target) return null;
  const kind = target.kind === "declaration" ? "binding" : "reference";
  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: "```lunas\n(" + kind + ") " + target.name + "\n```",
    },
    range: target.range,
  };
}
