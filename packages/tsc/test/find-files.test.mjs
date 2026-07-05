// Tests for .lunas file discovery, using a temp fixture tree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { findLunasFiles } from "../dist/find-files.js";

function makeTree() {
  const root = mkdtempSync(path.join(tmpdir(), "lunas-tsc-"));
  mkdirSync(path.join(root, "src", "components"), { recursive: true });
  mkdirSync(path.join(root, "node_modules", "pkg"), { recursive: true });
  writeFileSync(path.join(root, "src", "App.lunas"), "html:\n");
  writeFileSync(path.join(root, "src", "components", "Button.lunas"), "html:\n");
  writeFileSync(path.join(root, "src", "notes.txt"), "ignore me");
  writeFileSync(path.join(root, "node_modules", "pkg", "Dep.lunas"), "html:\n");
  return root;
}

test("walks directories, keeping .lunas and skipping node_modules", () => {
  const root = makeTree();
  try {
    const files = findLunasFiles([root]).map((f) => path.relative(root, f));
    assert.deepEqual(files, [
      path.join("src", "App.lunas"),
      path.join("src", "components", "Button.lunas"),
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts explicit file paths and de-duplicates", () => {
  const root = makeTree();
  try {
    const file = path.join(root, "src", "App.lunas");
    const files = findLunasFiles([file, file, root]);
    const appHits = files.filter((f) => f.endsWith("App.lunas"));
    assert.equal(appHits.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("non-existent paths are ignored", () => {
  assert.deepEqual(findLunasFiles(["definitely/not/here"]), []);
});
