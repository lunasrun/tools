// Tests for the runCheck orchestration over a temp fixture tree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runCheck, summaryLine } from "../dist/run.js";

// Fake compiler: flags the word `bad` as one error at its byte offset.
const fakeCompile = (source) => {
  const at = source.indexOf("bad");
  const diagnostics =
    at >= 0
      ? [{ message: "`bad` is not defined", severity: "error", start: at, end: at + 3 }]
      : [];
  return { code: diagnostics.length ? null : "", diagnostics };
};

function makeTree() {
  const root = mkdtempSync(path.join(tmpdir(), "lunas-tsc-run-"));
  mkdirSync(path.join(root, "src"), { recursive: true });
  writeFileSync(path.join(root, "src", "Ok.lunas"), "html:\n  <p>ok</p>");
  writeFileSync(path.join(root, "src", "Bad.lunas"), "html:\n  <p>${ bad }</p>");
  return root;
}

test("runCheck compiles every file and reports errors with exit code 1", () => {
  const root = makeTree();
  try {
    const run = runCheck(fakeCompile, [root]);
    assert.equal(run.files.length, 2);
    assert.equal(run.summary.errors, 1);
    assert.equal(run.code, 1);
    // A diagnostic line points at Bad.lunas with the message.
    assert.ok(
      run.lines.some((l) => l.includes("Bad.lunas") && l.includes("`bad` is not defined")),
    );
    // Last line is the summary.
    assert.equal(run.lines.at(-1), summaryLine(run.summary));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runCheck on clean files exits 0", () => {
  const root = mkdtempSync(path.join(tmpdir(), "lunas-tsc-clean-"));
  try {
    writeFileSync(path.join(root, "A.lunas"), "html:\n  <p>fine</p>");
    const run = runCheck(fakeCompile, [root]);
    assert.equal(run.summary.errors, 0);
    assert.equal(run.code, 0);
    assert.match(run.lines.at(-1), /1 file\(s\): 0 error\(s\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runCheck with no .lunas files yields an empty run", () => {
  const run = runCheck(fakeCompile, ["definitely/missing"]);
  assert.deepEqual(run.files, []);
  assert.equal(run.code, 0);
  assert.equal(run.summary.files, 0);
});
