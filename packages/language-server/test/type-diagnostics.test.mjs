// Tests for Tier 2 (real TypeScript) diagnostics. These run the actual TS
// checker over the virtual module — no wasm binary needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { typeDiagnostics } from "../dist/type-diagnostics.js";

const codes = (src) => typeDiagnostics(src).map((d) => d.code);

test("flags a type-mismatched assignment in the script (2322)", () => {
  const diags = typeDiagnostics('script:\n  let x: number = "str"');
  assert.equal(diags.length, 1);
  assert.equal(diags[0].code, 2322);
  assert.match(diags[0].message, /not assignable to type 'number'/);
  assert.equal(diags[0].range.start.line, 1); // the script's second line
});

test("flags a bad method call inside a ${…} template expression (2339)", () => {
  const diags = typeDiagnostics(
    "script:\n  let x = 5\nhtml:\n  <p>${ x.toUpperCase() }</p>",
  );
  assert.equal(diags.length, 1);
  assert.equal(diags[0].code, 2339);
  assert.match(diags[0].message, /toUpperCase.*does not exist on type 'number'/);
  // Positioned in the template line (line index 3), not the script.
  assert.equal(diags[0].range.start.line, 3);
});

test("@input props are typed — a valid use is not flagged", () => {
  assert.deepEqual(
    codes("@input name: string\nscript:\n  const g = name.toUpperCase()"),
    [],
  );
});

test("@input props are typed — a wrong use IS flagged (2339)", () => {
  assert.deepEqual(
    codes("@input count: number\nscript:\n  const g = count.toUpperCase()"),
    [2339],
  );
});

test("valid script + template produces nothing", () => {
  const src = [
    "script:",
    "  let x = 5",
    "  function add(a: number) { return a + 1 }",
    "  add(x)",
    "html:",
    "  <p>${ x }</p>",
  ].join("\n");
  assert.deepEqual(codes(src), []);
});

test("DOM/ES globals are available (no false positives)", () => {
  assert.deepEqual(
    codes('script:\n  console.log(Math.max(1, 2))\n  const d = new Date().getTime()'),
    [],
  );
});

test("a script with a top-level import still type-checks the rest", () => {
  // The import is a (never-reported) syntax error; the real type error remains.
  assert.deepEqual(
    codes('script:\n  import { foo } from "./x"\n  let y: number = "no"'),
    [2322],
  );
});

test("no script and no interpolations → nothing", () => {
  assert.deepEqual(codes("html:\n  <p>hi</p>\nstyle:\n  p{}"), []);
});

test("never throws on garbage/empty input", () => {
  for (const src of ["", "not lunas", "script:", "html:\n  ${", "script:\n  @@@"]) {
    assert.ok(Array.isArray(typeDiagnostics(src)));
  }
});
