// Real tokenization tests: load the Lunas grammar into an actual
// vscode-textmate Registry backed by vscode-oniguruma (the same engine VS
// Code uses) and assert scopes on key tokens from the fixtures in
// test/fixtures/. This exercises the grammar end-to-end, including the real
// embedded HTML/CSS/TypeScript grammars (via tm-grammars), not just the
// grammar's own JSON shape (see grammar.test.mjs for that).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tokenizeSource, tokenizeToFlat, findToken, tokensWithScope } from "./tokenize-helper.mjs";

const fixture = (name) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

test("block keywords are scoped as keyword.control.block.lunas", async () => {
  const tokens = await tokenizeToFlat(fixture("counter.lunas"));
  const html = findToken(tokens, { text: "html", scope: "keyword.control.block.lunas" });
  const style = findToken(tokens, { text: "style", scope: "keyword.control.block.lunas" });
  const script = findToken(tokens, { text: "script", scope: "keyword.control.block.lunas" });
  assert.ok(html, "html: keyword should be scoped");
  assert.ok(style, "style: keyword should be scoped");
  assert.ok(script, "script: keyword should be scoped");
});

test("html block content is scoped meta.embedded.block.html and tokenizes as HTML", async () => {
  const tokens = await tokenizeToFlat(fixture("counter.lunas"));
  const embeddedHtml = tokensWithScope(tokens, "meta.embedded.block.html");
  assert.ok(embeddedHtml.length > 0);
  // The <main> tag's entity name should come from our tag-open rule.
  const mainTag = findToken(tokens, { text: "main", scope: "entity.name.tag.lunas" });
  assert.ok(mainTag, "opening tag name should be scoped entity.name.tag.lunas");
});

test("style block content tokenizes as real CSS (property names, selectors)", async () => {
  const tokens = await tokenizeToFlat(fixture("counter.lunas"));
  const prop = findToken(tokens, {
    text: "font-family",
    scope: "support.type.property-name.css",
  });
  assert.ok(prop, "CSS property name should be scoped via source.css");
  const selector = findToken(tokens, { text: "app", scope: "entity.other.attribute-name.class.css" });
  assert.ok(selector, "CSS class selector should be scoped via source.css");
});

test("script block content tokenizes as real TypeScript", async () => {
  const tokens = await tokenizeToFlat(fixture("counter.lunas"));
  const letKeyword = findToken(tokens, { text: "let", scope: "storage.type.ts" });
  assert.ok(letKeyword, "let should be scoped via source.ts");
  const typeAnnotation = findToken(tokens, { text: "number", scope: "support.type.primitive.ts" });
  assert.ok(typeAnnotation, "TS type annotations should tokenize (number[])");
});

test("interpolation ${...} is punctuation + embedded TypeScript", async () => {
  const tokens = await tokenizeToFlat(fixture("counter.lunas"));
  const dollar = findToken(tokens, {
    text: "$",
    scope: "punctuation.definition.template-expression.begin.lunas",
  });
  const open = findToken(tokens, {
    text: "{",
    scope: "punctuation.section.embedded.begin.lunas",
  });
  const close = findToken(tokens, {
    text: "}",
    scope: "punctuation.section.embedded.end.lunas",
  });
  assert.ok(dollar, "$ should be scoped as template-expression punctuation");
  assert.ok(open, "{ should be scoped as embedded-begin punctuation");
  assert.ok(close, "} should be scoped as embedded-end punctuation");
  // The identifier inside should come from the real TS grammar.
  const label = findToken(tokens, { text: "label", scope: "variable.other.readwrite.ts" });
  assert.ok(label, "identifiers inside ${...} should tokenize as TypeScript");
  // And carry the Lunas expression wrapper scope too.
  const countToken = tokens.find(
    (t) => t.text === "count" && t.scopes.includes("meta.embedded.expression.lunas"),
  );
  assert.ok(countToken, "interpolation content should carry meta.embedded.expression.lunas");
});

test(":if / :elseif / :else are structural directives with embedded TS conditions", async () => {
  const tokens = await tokenizeToFlat(fixture("counter.lunas"));
  const ifKw = findToken(tokens, { text: "if", scope: "keyword.control.directive.lunas" });
  const elseifKw = findToken(tokens, { text: "elseif", scope: "keyword.control.directive.lunas" });
  const elseKw = findToken(tokens, { text: "else", scope: "keyword.control.directive.lunas" });
  assert.ok(ifKw, ":if should be a keyword.control.directive.lunas");
  assert.ok(elseifKw, ":elseif should be a keyword.control.directive.lunas");
  assert.ok(elseKw, ":else should be a keyword.control.directive.lunas");
  // :if="count == 0" -- the condition should tokenize as TypeScript.
  const comparison = findToken(tokens, { text: "==", scope: "keyword.operator.comparison.ts" });
  assert.ok(comparison, ":if condition should tokenize with the TS grammar");
});

test(":for iterates with an embedded TS for-header and :key is a binding", async () => {
  const tokens = await tokenizeToFlat(fixture("counter.lunas"));
  const forKw = findToken(tokens, { text: "for", scope: "keyword.control.directive.lunas" });
  assert.ok(forKw, ":for should be a keyword.control.directive.lunas");
  const ofKw = findToken(tokens, { text: "of", scope: "keyword.operator.expression.of.ts" });
  assert.ok(ofKw, ":for header should tokenize its `of` as TypeScript");
  const key = findToken(tokens, { text: "key", scope: "entity.other.attribute-name.binding.lunas" });
  assert.ok(key, ":key should be an attribute binding");
});

test("@event handlers are scoped as events with embedded TS", async () => {
  const tokens = await tokenizeToFlat(fixture("counter.lunas"));
  const at = findToken(tokens, { text: "@", scope: "punctuation.definition.directive.lunas" });
  const click = findToken(tokens, {
    text: "click",
    scope: "entity.other.attribute-name.event.lunas",
  });
  assert.ok(at, "@ should be directive punctuation");
  assert.ok(click, "click should be an event attribute name");
  const fnCall = findToken(tokens, { text: "increment", scope: "entity.name.function.ts" });
  assert.ok(fnCall, "event handler body should tokenize as a TS call expression");
});

test("@input and @use top-level directives are scoped", async () => {
  const tokens = await tokenizeToFlat(fixture("counter.lunas"));
  const input = findToken(tokens, { text: "@input", scope: "keyword.control.directive.lunas" });
  assert.ok(input, "@input should be a directive keyword");
  const label = findToken(tokens, { text: "label", scope: "variable.other.property.lunas" });
  assert.ok(label, "@input's prop name should be scoped");
  const type = findToken(tokens, { text: "string", scope: "support.type.lunas" });
  assert.ok(type, "@input's type annotation should be scoped");

  const componentsTokens = await tokenizeToFlat(fixture("components.lunas"));
  const use = findToken(componentsTokens, { text: "@use", scope: "keyword.control.directive.lunas" });
  assert.ok(use, "@use should be a directive keyword");
  const componentName = findToken(componentsTokens, {
    text: "Counter",
    scope: "entity.name.type.class.lunas",
  });
  assert.ok(componentName, "@use's component name should be scoped");
});

test("two-way bindings (::name=) are distinct from one-way bindings (:name=)", async () => {
  const tokens = await tokenizeToFlat(fixture("components.lunas"));
  const twoWay = findToken(tokens, {
    text: "value",
    scope: "entity.other.attribute-name.two-way.lunas",
  });
  assert.ok(twoWay, "::value should be scoped as a two-way binding");
  const oneWay = findToken(tokens, {
    text: "start",
    scope: "entity.other.attribute-name.binding.lunas",
  });
  assert.ok(oneWay, ":start should be scoped as a one-way binding");
});

test("component tags (capitalized custom elements) are scoped distinctly from HTML elements", async () => {
  const tokens = await tokenizeToFlat(fixture("components.lunas"));
  const componentOpen = findToken(tokens, {
    text: "Card",
    scope: "support.class.component.lunas",
  });
  assert.ok(componentOpen, "opening <Card> should carry the component scope");
  const componentClose = tokens.find(
    (t) =>
      t.text === "Card" &&
      t.scopes.includes("support.class.component.lunas") &&
      t.line > componentOpen.line,
  );
  assert.ok(componentClose, "closing </Card> should also carry the component scope");

  // A lowercase element like <input> should NOT be scoped as a component.
  const inputTag = findToken(tokens, { text: "input", scope: "entity.name.tag.lunas" });
  assert.ok(inputTag);
  assert.ok(
    !inputTag.scopes.includes("support.class.component.lunas"),
    "lowercase <input> must not be scoped as a component",
  );
});

test("attribute values containing ${...} still tokenize the interpolation", async () => {
  const tokens = await tokenizeToFlat(fixture("components.lunas"));
  // class="tag ${flavor}"
  const flavor = tokens.find(
    (t) => t.text === "flavor" && t.scopes.includes("meta.embedded.expression.lunas"),
  );
  assert.ok(flavor, "interpolation inside a plain attribute value should still tokenize");
});

test("braces inside strings/comments do not break interpolation or block regions", async () => {
  const tokens = await tokenizeToFlat(fixture("strings-and-comments.lunas"));
  // The literal `{`/`}` inside the title="..." attribute must stay part of
  // the plain string, not be misread as an interpolation.
  const literalAttr = tokens.find(
    (t) => t.text.includes("literal { not an interpolation }") && t.scopes.includes("string.quoted.double.lunas"),
  );
  assert.ok(literalAttr, "braces in a plain attribute value should stay literal string content");

  // The `}` inside a JS string literal inside ${...} must not prematurely
  // close the interpolation -- the closing `}` token should come from the
  // real TS string, not from Lunas's own end-of-interpolation punctuation
  // ending early.
  const closeTokens = tokens.filter(
    (t) => t.text === "}" && t.scopes.includes("punctuation.section.embedded.end.lunas"),
  );
  assert.ok(closeTokens.length >= 2, "each ${...} should close exactly once, after the full TS string");

  // script: block still tokenizes correctly after html: had stray braces.
  const scriptLet = tokens.find(
    (t) => t.text === "count" && t.scopes.includes("variable.other.readwrite.ts") && t.line > closeTokens[0].line,
  );
  assert.ok(scriptLet, "script: block should still tokenize as TypeScript after html: content with braces");
});

test("tokenizeSource returns per-line token arrays matching the source line count", async () => {
  const src = fixture("counter.lunas");
  const lines = await tokenizeSource(src);
  assert.equal(lines.length, src.split(/\r\n|\n/).length);
});
