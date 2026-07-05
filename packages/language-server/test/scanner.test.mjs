// Unit tests for the `.lunas` structural block scanner. Pure string in / spans
// out — no wasm binary, no server. Covers block boundaries, missing blocks,
// CRLF, multibyte characters, and nested braces.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scanStructure, findInterpolations } from "../dist/scanner.js";

/** Helper: read the source slice a span points at. */
const slice = (src, span) => src.slice(span.start, span.end);

test("finds the three top-level blocks in order", () => {
  const src = ["script:", "  let x = 1", "html:", "  <p></p>", "style:", "  p {}"].join("\n");
  const { blocks } = scanStructure(src);
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["script", "html", "style"],
  );
  assert.deepEqual(
    blocks.map((b) => b.label),
    ["script:", "html:", "style:"],
  );
});

test("label span covers exactly the label token", () => {
  const src = "html:\n  <p></p>\n";
  const { blocks } = scanStructure(src);
  assert.equal(slice(src, blocks[0].labelSpan), "html:");
});

test("body span covers the indented body, not the label", () => {
  const src = "html:\n  <p></p>\n  <span></span>\n";
  const { blocks } = scanStructure(src);
  const body = slice(src, blocks[0].bodySpan);
  assert.match(body, /^\s*<p><\/p>/);
  assert.match(body, /<span><\/span>\s*$/);
  assert.doesNotMatch(body, /html:/);
});

test("a block with no body yields an empty body span and no interpolations", () => {
  const src = "html:\nscript:\n  let x";
  const { blocks } = scanStructure(src);
  const html = blocks[0];
  assert.equal(html.kind, "html");
  assert.equal(html.bodySpan.start, html.bodySpan.end);
  assert.deepEqual(html.interpolations, []);
});

test("blank lines inside a body do not terminate the block", () => {
  const src = "html:\n  <p></p>\n\n  <span></span>\nstyle:\n  p{}";
  const { blocks } = scanStructure(src);
  assert.equal(blocks.length, 2);
  assert.match(slice(src, blocks[0].bodySpan), /<span><\/span>/);
});

test("a non-indented non-label line ends the block and is not a block", () => {
  const src = "html:\n  <p></p>\nplain text\nstyle:\n  p{}";
  const { blocks } = scanStructure(src);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].kind, "html");
  assert.equal(blocks[1].kind, "style");
});

test("missing blocks: empty source yields no blocks", () => {
  assert.deepEqual(scanStructure("").blocks, []);
});

test("missing blocks: plain text yields no blocks", () => {
  assert.deepEqual(scanStructure("just some words\nmore words").blocks, []);
});

test("a label needs the colon and nothing else on the line", () => {
  // `htmlx:` and `html: extra` are not block labels.
  const src = "htmlx:\n  x\nhtml: extra\n  y";
  assert.deepEqual(scanStructure(src).blocks, []);
});

test("CRLF line endings are handled", () => {
  const src = "html:\r\n  <p>${ name }</p>\r\nstyle:\r\n  p{}\r\n";
  const { blocks } = scanStructure(src);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].kind, "html");
  const [interp] = blocks[0].interpolations;
  assert.equal(slice(src, interp), "${ name }");
});

test("multibyte characters keep spans in UTF-16 units", () => {
  // 'あ' is one UTF-16 unit; an emoji is a surrogate pair (two units).
  const src = "html:\n  <p>あ${ 名前 }😀</p>";
  const { blocks } = scanStructure(src);
  const [interp] = blocks[0].interpolations;
  assert.equal(slice(src, interp), "${ 名前 }");
});

test("interpolations: simple ${…}", () => {
  const src = "a ${ x } b ${ y } c";
  const found = findInterpolations(src, 0, src.length);
  assert.equal(found.length, 2);
  assert.equal(src.slice(found[0].start, found[0].end), "${ x }");
  assert.equal(src.slice(found[1].start, found[1].end), "${ y }");
});

test("interpolations: nested braces are a single interpolation", () => {
  const src = "${ a.map(x => ({ id: x })) }";
  const found = findInterpolations(src, 0, src.length);
  assert.equal(found.length, 1);
  assert.equal(src.slice(found[0].start, found[0].end), src);
  assert.equal(src.slice(found[0].inner.start, found[0].inner.end), " a.map(x => ({ id: x })) ");
});

test("a bare `{` without `$` is not an interpolation", () => {
  // Object literals / CSS braces must not be mistaken for interpolations.
  const found = findInterpolations("p { color: red }", 0, 16);
  assert.equal(found.length, 0);
});

test("interpolations: unterminated ${ runs to end of range without throwing", () => {
  const src = "text ${ unclosed";
  const found = findInterpolations(src, 0, src.length);
  assert.equal(found.length, 1);
  assert.equal(found[0].end, src.length);
  assert.equal(src.slice(found[0].inner.start, found[0].inner.end), " unclosed");
});

test("inner span excludes the ${ and }", () => {
  const src = "html:\n  <p>${ name }</p>";
  const { blocks } = scanStructure(src);
  const [interp] = blocks[0].interpolations;
  assert.equal(src.slice(interp.inner.start, interp.inner.end), " name ");
});

test("interpolations only scanned within a block body", () => {
  // The `${ ignored }` at column 0 is outside any block body.
  const src = "${ ignored }\nhtml:\n  ${ kept }";
  const { blocks } = scanStructure(src);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].interpolations.length, 1);
  assert.equal(src.slice(blocks[0].interpolations[0].start, blocks[0].interpolations[0].end), "${ kept }");
});

test("final line without a trailing newline is still part of the body", () => {
  const src = "html:\n  <p>${ x }</p>"; // no trailing \n
  const { blocks } = scanStructure(src);
  assert.equal(blocks[0].interpolations.length, 1);
  assert.match(slice(src, blocks[0].bodySpan), /<p>\$\{ x \}<\/p>$/);
});
