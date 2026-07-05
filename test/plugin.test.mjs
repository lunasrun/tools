// Fast, wasm-free check that our vite-plugin-lunas wiring behaves: a `.lunas`
// module is routed through the (injected) compiler, non-Lunas ids are skipped,
// and error diagnostics abort the transform. Injecting a fake compiler means
// this never loads the real wasm binary — mirroring the rule that downstream
// tests must not require it. The real compiler is exercised by the build (CI's
// `pnpm wasm:build` + `pnpm build`).
import { test } from "node:test";
import assert from "node:assert/strict";
import lunas from "vite-plugin-lunas";

// Minimal Rollup plugin-context stub: capture error/warn instead of throwing on
// warn, but record errors so we can assert the failure path.
function makeCtx() {
  const calls = { errors: [], warns: [] };
  return {
    calls,
    error(e) {
      calls.errors.push(e);
      throw new Error(typeof e === "string" ? e : e.message);
    },
    warn(w) {
      calls.warns.push(w);
    },
  };
}

test("compiles a .lunas module through the injected compiler", () => {
  const fake = { compile: () => ({ code: "export default 42;", diagnostics: [] }) };
  const plugin = lunas({ compiler: fake });
  const ctx = makeCtx();

  const out = plugin.transform.call(ctx, "html:\n    <p>hi</p>", "/src/App.lunas");

  assert.equal(out.code, "export default 42;");
  assert.equal(out.map, null);
  assert.equal(ctx.calls.errors.length, 0);
});

test("ignores non-Lunas modules", () => {
  const plugin = lunas({ compiler: { compile: () => assert.fail("should not compile") } });
  const out = plugin.transform.call(makeCtx(), "const x = 1;", "/src/main.ts");
  assert.equal(out, null);
});

test("surfaces error diagnostics via this.error", () => {
  const fake = {
    compile: () => ({
      code: null,
      diagnostics: [{ severity: "error", message: "boom", code: "E001" }],
    }),
  };
  const plugin = lunas({ compiler: fake });
  const ctx = makeCtx();

  assert.throws(() => plugin.transform.call(ctx, "html:", "/src/Bad.lunas"));
  assert.equal(ctx.calls.errors.length, 1);
});
