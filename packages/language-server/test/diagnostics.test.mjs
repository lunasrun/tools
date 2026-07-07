// Unit tests for the compiler-result -> LSP-diagnostics mapping. Uses a fake
// CompileResult, so it needs neither the wasm binary nor a running server.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toLspDiagnostics,
  toLspSeverity,
  DIAGNOSTIC_SOURCE,
} from "../dist/diagnostics.js";

// LSP DiagnosticSeverity: Error=1, Warning=2, Information=3, Hint=4.
test("severity maps to the LSP enum", () => {
  assert.equal(toLspSeverity("error"), 1);
  assert.equal(toLspSeverity("warning"), 2);
  assert.equal(toLspSeverity("hint"), 4);
});

test("no diagnostics yields an empty array", () => {
  assert.deepEqual(toLspDiagnostics("html:\n", { code: "", diagnostics: [] }), []);
});

test("byte ranges become line/character ranges", () => {
  const source = "html:\n  <p>{ bad }</p>";
  const start = source.indexOf("bad"); // 13 (ASCII, so byte == char index)
  const result = {
    code: null,
    diagnostics: [
      {
        message: "`bad` is not defined",
        severity: "error",
        start,
        end: start + 3,
      },
    ],
  };
  const [diag] = toLspDiagnostics(source, result);
  assert.equal(diag.message, "`bad` is not defined");
  assert.equal(diag.severity, 1);
  assert.equal(diag.source, DIAGNOSTIC_SOURCE);
  assert.deepEqual(diag.range, {
    start: { line: 1, character: 7 },
    end: { line: 1, character: 10 },
  });
});

test("multi-byte source offsets convert correctly", () => {
  const source = "あ = 1"; // 'あ' is 3 UTF-8 bytes / 1 UTF-16 unit
  const result = {
    code: null,
    diagnostics: [{ message: "unused", severity: "hint", start: 0, end: 3 }],
  };
  const [diag] = toLspDiagnostics(source, result);
  assert.equal(diag.severity, 4);
  assert.deepEqual(diag.range, {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 1 },
  });
});

test("multiple diagnostics preserve order", () => {
  const source = "a\nb\nc";
  const result = {
    code: null,
    diagnostics: [
      { message: "one", severity: "error", start: 0, end: 1 },
      { message: "two", severity: "warning", start: 2, end: 3 },
    ],
  };
  const diags = toLspDiagnostics(source, result);
  assert.deepEqual(
    diags.map((d) => d.message),
    ["one", "two"],
  );
  assert.equal(diags[1].range.start.line, 1);
});
