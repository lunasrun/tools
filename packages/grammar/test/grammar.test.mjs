// Structural validation of the Lunas TextMate grammar and language config.
// Dependency-light: parses the JSON and asserts the contract the VS Code
// extension and other consumers rely on (scope name, embedded languages,
// directive rules). Real tokenization (actually running the grammar through
// vscode-textmate) is covered by test/tokenize.test.mjs.
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

test("top-level patterns cover directives, html, style and script blocks", () => {
  const includes = grammar.patterns.map((p) => p.include);
  assert.deepEqual(
    includes.sort(),
    ["#html-block", "#script-block", "#style-block", "#top-level-directives"].sort(),
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

test("blocks carry the contentName the VS Code extension maps to embedded languages", () => {
  assert.equal(grammar.repository["html-block"].contentName, "meta.embedded.block.html");
  assert.equal(grammar.repository["style-block"].contentName, "meta.embedded.block.css");
  assert.equal(grammar.repository["script-block"].contentName, "meta.embedded.block.ts");
});

test("interpolation embeds TypeScript expressions using ${ ... }", () => {
  const interp = grammar.repository.interpolation;
  assert.equal(interp.begin, "(\\$)(\\{)");
  assert.equal(interp.end, "(\\})");
  assert.equal(interp.name, "meta.embedded.expression.lunas");
  // Interpolation content is brace-balanced (so `${ {a:1}.a }` and similar
  // nested-brace expressions don't terminate early) via #embedded-ts-balanced.
  const dumped = JSON.stringify(interp);
  assert.match(dumped, /embedded-ts-balanced/);
  const balanced = JSON.stringify(grammar.repository["embedded-ts-balanced"]);
  assert.match(balanced, /source\.ts/);
});

test("directive-attributes recognize :if/:elseif/:else/:for, ::two-way, bindings and events", () => {
  const dumped = JSON.stringify(grammar.repository["directive-attributes"]);
  assert.match(dumped, /if\|elseif\|for/);
  assert.match(dumped, /\(:\)\(else\)/);
  assert.match(dumped, /attribute-name\.two-way\.lunas/);
  assert.match(dumped, /attribute-name\.binding\.lunas/);
  assert.match(dumped, /attribute-name\.event\.lunas/);
});

test("component tags (capitalized custom elements) are scoped distinctly", () => {
  // Opening tags are classified inline by #tag-open (component vs. plain
  // element); closing tags are handled by #component-tag-close.
  const tagOpen = JSON.stringify(grammar.repository["tag-open"]);
  assert.match(tagOpen, /support\.class\.component\.lunas/);
  assert.match(tagOpen, /\[A-Z\]/);

  const close = grammar.repository["component-tag-close"];
  assert.ok(close, "component-tag-close rule should exist");
  const dumped = JSON.stringify(close);
  assert.match(dumped, /support\.class\.component\.lunas/);
  assert.match(dumped, /\[A-Z\]/);
});

test("top-level directives cover @input and @use", () => {
  const dumped = JSON.stringify(grammar.repository["top-level-directives"]);
  assert.match(dumped, /@input/);
  assert.match(dumped, /@use/);
});

test("html-block includes interpolation and tag-open (directives) before the HTML grammar", () => {
  const patterns = grammar.repository["html-block"].patterns.map((p) => p.include);
  const interpIdx = patterns.indexOf("#interpolation");
  const tagOpenIdx = patterns.indexOf("#tag-open");
  const htmlIdx = patterns.indexOf("text.html.basic");
  assert.ok(interpIdx !== -1 && interpIdx < htmlIdx);
  assert.ok(tagOpenIdx !== -1 && tagOpenIdx < htmlIdx);
  // #tag-open owns opening tags entirely (so directive-attributes see them
  // before text.html.basic's generic attribute rules would), scanning
  // #directive-attributes before the #plain-attribute fallback.
  const tagOpenPatterns = grammar.repository["tag-open"].patterns.map((p) => p.include);
  assert.deepEqual(tagOpenPatterns, ["#directive-attributes", "#plain-attribute"]);
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
