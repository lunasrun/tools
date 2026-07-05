// Unit tests for the navigation features, using a fake analyze result.
// No wasm binary, no server.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  definitionAt,
  referencesAt,
  highlightsAt,
  renameEdits,
  hoverAt,
} from "../dist/navigation.js";

// html: reference `count` at bytes 14..19; script: `count` decl at bytes 40..45.
const SRC = "html:\n  <p>${ count }</p>\nscript:\n  let count = 0";
const ANALYSIS = {
  bindings: [{ name: "count", start: 40, end: 45 }],
  references: [{ name: "count", start: 14, end: 19 }],
};
const URI = "file:///c.lunas";

// Positions inside each occurrence and one on nothing.
const ON_REF = { line: 1, character: 10 };
const ON_DECL = { line: 3, character: 8 };
const ON_NONE = { line: 0, character: 0 };
const DECL_RANGE = {
  start: { line: 3, character: 6 },
  end: { line: 3, character: 11 },
};
const REF_RANGE = {
  start: { line: 1, character: 8 },
  end: { line: 1, character: 13 },
};

test("definition from a reference jumps to the declaration", () => {
  assert.deepEqual(definitionAt(URI, SRC, ANALYSIS, ON_REF), [
    { uri: URI, range: DECL_RANGE },
  ]);
});

test("definition from the declaration resolves to itself", () => {
  assert.deepEqual(definitionAt(URI, SRC, ANALYSIS, ON_DECL), [
    { uri: URI, range: DECL_RANGE },
  ]);
});

test("definition off any symbol is empty", () => {
  assert.deepEqual(definitionAt(URI, SRC, ANALYSIS, ON_NONE), []);
});

test("references include or exclude the declaration per context", () => {
  const withDecl = referencesAt(URI, SRC, ANALYSIS, ON_REF, true);
  assert.equal(withDecl.length, 2);
  assert.deepEqual(
    withDecl.map((l) => l.range).sort((a, b) => a.start.line - b.start.line),
    [REF_RANGE, DECL_RANGE],
  );

  const withoutDecl = referencesAt(URI, SRC, ANALYSIS, ON_REF, false);
  assert.deepEqual(withoutDecl, [{ uri: URI, range: REF_RANGE }]);
});

test("document highlight tags declaration Write and reference Read", () => {
  const highlights = highlightsAt(SRC, ANALYSIS, ON_DECL);
  assert.equal(highlights.length, 2);
  const decl = highlights.find((h) => h.range.start.line === 3);
  const ref = highlights.find((h) => h.range.start.line === 1);
  assert.equal(decl.kind, 3); // DocumentHighlightKind.Write
  assert.equal(ref.kind, 2); // DocumentHighlightKind.Read
});

test("rename edits every occurrence in the document", () => {
  const edit = renameEdits(URI, SRC, ANALYSIS, ON_REF, "total");
  const edits = edit.changes[URI];
  assert.equal(edits.length, 2);
  assert.ok(edits.every((e) => e.newText === "total"));
  const ranges = edits.map((e) => e.range);
  assert.ok(ranges.some((r) => r.start.line === 1));
  assert.ok(ranges.some((r) => r.start.line === 3));
});

test("rename off any symbol returns null", () => {
  assert.equal(renameEdits(URI, SRC, ANALYSIS, ON_NONE, "x"), null);
});

test("hover labels binding vs reference", () => {
  assert.match(hoverAt(SRC, ANALYSIS, ON_DECL).contents.value, /\(binding\) count/);
  assert.match(hoverAt(SRC, ANALYSIS, ON_REF).contents.value, /\(reference\) count/);
  assert.equal(hoverAt(SRC, ANALYSIS, ON_NONE), null);
});

test("hover range covers the symbol under the cursor", () => {
  assert.deepEqual(hoverAt(SRC, ANALYSIS, ON_REF).range, REF_RANGE);
});
