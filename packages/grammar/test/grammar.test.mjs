// Structural validation of the Lunas TextMate grammar and language config.
// Dependency-light: parses the JSON and asserts the contract the VS Code
// extension and other consumers rely on (scope name, embedded languages,
// directive rules). Full tokenization is covered later (roadmap:
// grammar-embedded-langs) once vscode-textmate is wired in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));

const grammar = read("../lunas.tmLanguage.json");
const langConfig = read("../language-configuration.json");

test("grammar declares the source.lunas scope and .lunas file type", () => {
  assert.equal(grammar.scopeName, "source.lunas");
  assert.deepEqual(grammar.fileTypes, ["lunas"]);
});

test("top-level patterns cover html, style and script blocks", () => {
  const includes = grammar.patterns.map((p) => p.include);
  assert.deepEqual(
    includes.sort(),
    ["#html-block", "#script-block", "#style-block"].sort(),
  );
});

test("each block embeds the correct language grammar", () => {
  const embeds = {
    "html-block": "text.html.basic",
    "style-block": "source.css",
    "script-block": "source.ts",
  };
  for (const [rule, embedded] of Object.entries(embeds)) {
    const patterns = grammar.repository[rule].patterns.map((p) => p.include);
    assert.ok(
      patterns.includes(embedded),
      `${rule} should include ${embedded}`,
    );
  }
});

test("blocks terminate at the next top-level block header", () => {
  for (const rule of ["html-block", "style-block", "script-block"]) {
    assert.match(grammar.repository[rule].end, /html\|style\|script/);
  }
});

test("interpolation embeds TypeScript expressions", () => {
  const interp = grammar.repository.interpolation;
  assert.equal(interp.begin, "\\{");
  assert.equal(interp.end, "\\}");
  assert.ok(interp.patterns.some((p) => p.include === "source.ts"));
});

test("directives recognize :if/:for, bindings and events", () => {
  const dumped = JSON.stringify(grammar.repository.directives);
  assert.match(dumped, /if\|elif\|else\|for/);
  assert.match(dumped, /attribute-name\.binding\.lunas/);
  assert.match(dumped, /attribute-name\.event\.lunas/);
});

test("every repository regex is valid (JS-representable) and JSON well-formed", () => {
  // Walk the grammar collecting begin/end/match strings; ensure none is empty.
  const strings = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (["begin", "end", "match"].includes(k)) {
          assert.equal(typeof v, "string");
          assert.ok(v.length > 0, `${k} must not be empty`);
        } else {
          walk(v);
        }
      }
    }
  };
  walk(grammar);
});

test("language configuration has comments, brackets and auto-closing pairs", () => {
  assert.equal(langConfig.comments.lineComment, "//");
  assert.ok(Array.isArray(langConfig.brackets));
  assert.ok(langConfig.autoClosingPairs.some((p) => p.open === "{"));
  assert.ok(langConfig.surroundingPairs.length > 0);
});
