// Integration test for the real compiler bindings. Skips loudly when the
// bindings have not been built (`pnpm wasm:build`), so `node --test` stays green
// on machines without the wasm toolchain. CI's `wasm` job builds them first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isCompilerAvailable, loadCompiler } from "../dist/loader.js";

test("isCompilerAvailable reflects whether bindings were built", () => {
  assert.equal(typeof isCompilerAvailable(), "boolean");
});

test("loadCompiler throws a helpful error when bindings are missing", () => {
  if (isCompilerAvailable()) return; // covered by the integration path below
  assert.throws(() => loadCompiler(), /pnpm wasm:build/);
});

test(
  "compile() returns { code, diagnostics } for a .lunas source",
  { skip: !isCompilerAvailable() && "run `pnpm wasm:build` to enable" },
  () => {
    const compile = loadCompiler();
    const result = compile("html:\n  <p>hello</p>\n");
    assert.ok(result && typeof result === "object");
    assert.ok("code" in result);
    assert.ok(Array.isArray(result.diagnostics));
    for (const d of result.diagnostics) {
      assert.equal(typeof d.message, "string");
      assert.ok(["error", "warning", "hint"].includes(d.severity));
      assert.equal(typeof d.start, "number");
      assert.equal(typeof d.end, "number");
    }
  },
);
