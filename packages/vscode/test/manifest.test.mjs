// Validates the extension manifest's language/grammar contributions and that
// the grammar assets are synced into ./syntaxes (the test script runs
// `sync-grammar` first). No VS Code runtime needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));

const manifest = read("../package.json");

test("declares desktop and web entry points", () => {
  assert.equal(manifest.main, "./dist/extension.js");
  assert.equal(manifest.browser, "./dist/browser.js");
});

test("contributes the lunas language for .lunas files", () => {
  const [lang] = manifest.contributes.languages;
  assert.equal(lang.id, "lunas");
  assert.deepEqual(lang.extensions, [".lunas"]);
  assert.equal(lang.configuration, "./syntaxes/language-configuration.json");
});

test("contributes the source.lunas grammar with embedded languages", () => {
  const [grammar] = manifest.contributes.grammars;
  assert.equal(grammar.language, "lunas");
  assert.equal(grammar.scopeName, "source.lunas");
  assert.equal(grammar.path, "./syntaxes/lunas.tmLanguage.json");
  assert.deepEqual(grammar.embeddedLanguages, {
    "meta.embedded.block.html": "html",
    "meta.embedded.block.css": "css",
    "meta.embedded.block.ts": "typescript",
    "meta.embedded.expression.lunas": "typescript",
  });
});

test("grammar assets are synced and self-consistent", () => {
  const grammarFile = fileURLToPath(
    new URL("../syntaxes/lunas.tmLanguage.json", import.meta.url),
  );
  const configFile = fileURLToPath(
    new URL("../syntaxes/language-configuration.json", import.meta.url),
  );
  assert.ok(existsSync(grammarFile), "lunas.tmLanguage.json should be synced");
  assert.ok(existsSync(configFile), "language-configuration.json should be synced");

  const grammar = JSON.parse(readFileSync(grammarFile, "utf8"));
  assert.equal(
    grammar.scopeName,
    manifest.contributes.grammars[0].scopeName,
    "synced grammar scopeName must match the manifest",
  );
});
