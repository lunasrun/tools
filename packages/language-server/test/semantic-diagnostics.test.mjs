// Unit tests for the Tier 1 semantic diagnostics, using fake analyze results.
// No wasm binary, no server.
import { test } from "node:test";
import assert from "node:assert/strict";
import { semanticDiagnostics } from "../dist/semantic-diagnostics.js";

// DiagnosticSeverity.Warning === 2 in the LSP enum.
const WARNING = 2;

test("undefined template reference is one Warning", () => {
  // html:\n  <p>${ nope }</p>  — `nope` at bytes 14..18.
  const src = "html:\n  <p>${ nope }</p>";
  const analysis = {
    bindings: [],
    references: [{ name: "nope", start: 14, end: 18, kind: "variable" }],
  };
  const diags = semanticDiagnostics(src, analysis);
  assert.equal(diags.length, 1);
  assert.equal(diags[0].severity, WARNING);
  assert.equal(diags[0].source, "lunas");
  assert.equal(diags[0].code, "undefined-reference");
  assert.equal(diags[0].message, "'nope' is not defined");
});

test("undefined function call is a Warning", () => {
  // `@click="missing()"` yields a reference to `missing`.
  const src = 'html:\n  <button @click="missing()">go</button>';
  const analysis = {
    bindings: [],
    references: [{ name: "missing", start: 24, end: 31, kind: "variable" }],
  };
  const diags = semanticDiagnostics(src, analysis);
  assert.equal(diags.length, 1);
  assert.equal(diags[0].code, "undefined-reference");
  assert.equal(diags[0].message, "'missing' is not defined");
});

test("unknown component is a Warning with the component message", () => {
  const src = "html:\n  <Foo/>";
  const analysis = {
    bindings: [],
    references: [{ name: "Foo", start: 9, end: 12, kind: "component" }],
  };
  const diags = semanticDiagnostics(src, analysis);
  assert.equal(diags.length, 1);
  assert.equal(diags[0].severity, WARNING);
  assert.equal(diags[0].code, "unknown-component");
  assert.equal(
    diags[0].message,
    "Unknown component <Foo/> — is it declared with @use?",
  );
});

test("no false positive: a reference that is a binding", () => {
  // count declared in script and used in the template — resolved, no diagnostic.
  const src = "html:\n  <p>${ count }</p>\nscript:\n  let count = 0";
  const analysis = {
    bindings: [{ name: "count", start: 40, end: 45, kind: "variable" }],
    references: [{ name: "count", start: 14, end: 19, kind: "variable" }],
  };
  assert.deepEqual(semanticDiagnostics(src, analysis), []);
});

test("no false positive: @input / @use / :for bindings resolve their uses", () => {
  const src = "whatever";
  const analysis = {
    bindings: [
      { name: "name", start: 0, end: 4, kind: "prop" }, // @input
      { name: "Foo", start: 0, end: 3, kind: "component" }, // @use
      { name: "item", start: 0, end: 4, kind: "variable" }, // :for var
    ],
    references: [
      { name: "name", start: 0, end: 4, kind: "prop" },
      { name: "Foo", start: 0, end: 3, kind: "component" },
      { name: "item", start: 0, end: 4, kind: "variable" },
    ],
  };
  assert.deepEqual(semanticDiagnostics(src, analysis), []);
});

test("no false positive: known globals are not flagged", () => {
  const src = "whatever";
  const analysis = {
    bindings: [],
    references: [
      { name: "Math", start: 0, end: 4, kind: "variable" },
      { name: "console", start: 0, end: 7, kind: "variable" },
      { name: "window", start: 0, end: 6, kind: "variable" },
      { name: "true", start: 0, end: 4, kind: "variable" },
    ],
  };
  assert.deepEqual(semanticDiagnostics(src, analysis), []);
});

test("range maps to the reference's line/column", () => {
  // Multi-line source; `nope` sits on line 2 (0-based).
  // Bytes: "html:\n" =6, "  <p>\n" =6 (12), then "  ${ nope }" — `nope` at 17..21.
  const src = "html:\n  <p>\n  ${ nope }";
  assert.equal(src.slice(17, 21), "nope");
  const analysis = {
    bindings: [],
    references: [{ name: "nope", start: 17, end: 21, kind: "variable" }],
  };
  const diags = semanticDiagnostics(src, analysis);
  assert.equal(diags.length, 1);
  assert.deepEqual(diags[0].range, {
    start: { line: 2, character: 5 },
    end: { line: 2, character: 9 },
  });
});

test("empty analysis produces no diagnostics", () => {
  assert.deepEqual(
    semanticDiagnostics("html:\n  <p>hi</p>", { bindings: [], references: [] }),
    [],
  );
});
