// Unit tests for the semantic-tokens encoder, using a fake analyze result.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSemanticTokens,
  SEMANTIC_TOKEN_TYPES,
  SEMANTIC_TOKEN_MODIFIERS,
} from "../dist/semantic-tokens.js";

test("legend: variable=0, property=1, class=2; declaration modifier", () => {
  assert.deepEqual([...SEMANTIC_TOKEN_TYPES], ["variable", "property", "class"]);
  assert.deepEqual([...SEMANTIC_TOKEN_MODIFIERS], ["declaration"]);
});

test("encodes an @input prop decl + reclassified use (delta-encoded)", () => {
  // `@input name` (prop) at bytes 7..11; `${ name }` use at bytes 33..37.
  const src = "@input name:string\nhtml:\n  <p>${ name }</p>";
  const analysis = {
    bindings: [{ name: "name", start: 7, end: 11, kind: "prop" }],
    // analyze reports a plain use as "variable"; it should be reclassified to
    // the declaration's kind (property).
    references: [{ name: "name", start: 33, end: 37, kind: "variable" }],
  };
  const { data } = buildSemanticTokens(src, analysis);
  assert.deepEqual(data, [
    // deltaLine, deltaChar, length, tokenType, tokenModifiers
    0, 7, 4, 1, 1, // decl: line 0 char 7, property, declaration
    2, 8, 4, 1, 0, // use:  +2 lines, char 8, property (reclassified), no mods
  ]);
});

test("maps variable/component kinds and sorts by position", () => {
  const src = "x\nFoo";
  const analysis = {
    bindings: [
      { name: "x", start: 0, end: 1, kind: "variable" },
      { name: "Foo", start: 2, end: 5, kind: "component" },
    ],
    references: [],
  };
  const { data } = buildSemanticTokens(src, analysis);
  assert.deepEqual(data, [
    0, 0, 1, 0, 1, // x: variable, declaration
    1, 0, 3, 2, 1, // Foo: class (component), declaration
  ]);
});

test("empty analysis yields no tokens", () => {
  assert.deepEqual(buildSemanticTokens("html:\n", { bindings: [], references: [] }), {
    data: [],
  });
});
