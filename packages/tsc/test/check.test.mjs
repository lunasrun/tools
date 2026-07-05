// Unit tests for the checker core, using a fake compiler.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkSource,
  formatDiagnostic,
  summarize,
  exitCode,
} from "../dist/check.js";

const fakeCompile = (diagnostics) => () => ({ code: null, diagnostics });

test("checkSource reports 1-based line/column", () => {
  const source = "a\n  bad"; // 'bad' starts at byte 4 -> line 1 (0-based), col 2
  const compile = fakeCompile([
    { message: "boom", severity: "error", start: 4, end: 7 },
  ]);
  const [d] = checkSource(compile, "x.lunas", source);
  assert.deepEqual(d, {
    path: "x.lunas",
    line: 2,
    column: 3,
    severity: "error",
    message: "boom",
  });
});

test("formatDiagnostic renders path:line:col - severity: message", () => {
  const line = formatDiagnostic({
    path: "src/App.lunas",
    line: 3,
    column: 5,
    severity: "warning",
    message: "unused binding",
  });
  assert.equal(line, "src/App.lunas:3:5 - warning: unused binding");
});

test("summarize tallies by severity", () => {
  const diags = [
    { severity: "error" },
    { severity: "error" },
    { severity: "warning" },
    { severity: "hint" },
  ];
  assert.deepEqual(summarize(diags, 2), {
    files: 2,
    errors: 2,
    warnings: 1,
    hints: 1,
  });
});

test("exitCode is 1 only when there are errors", () => {
  assert.equal(exitCode({ files: 1, errors: 0, warnings: 3, hints: 0 }), 0);
  assert.equal(exitCode({ files: 1, errors: 1, warnings: 0, hints: 0 }), 1);
});

test("clean file produces no diagnostics", () => {
  const compile = fakeCompile([]);
  assert.deepEqual(checkSource(compile, "ok.lunas", "html:\n"), []);
});
