// Unit tests for the structural LSP features derived from the block scanner:
// documentSymbol, foldingRange and selectionRange. No wasm binary, no server.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  documentSymbols,
  foldingRanges,
  selectionRangeAt,
} from "../dist/structure.js";

const SRC = ["script:", "  let name = 'x'", "html:", "  <p>${ name }</p>", "style:", "  p { color: red }"].join(
  "\n",
);

test("documentSymbol lists one symbol per block", () => {
  const symbols = documentSymbols(SRC);
  assert.deepEqual(
    symbols.map((s) => s.name),
    ["script", "html", "style"],
  );
  // Each symbol's detail is the label; kind is a stable SymbolKind number.
  assert.equal(symbols[1].detail, "html:");
  assert.equal(typeof symbols[1].kind, "number");
});

test("documentSymbol nests interpolations under their block", () => {
  const symbols = documentSymbols(SRC);
  const html = symbols.find((s) => s.name === "html");
  assert.ok(html.children);
  assert.equal(html.children.length, 1);
  assert.match(html.children[0].name, /\$\{ … \}/);
  // The interpolation range sits on the html body line (line index 3).
  assert.equal(html.children[0].range.start.line, 3);
});

test("documentSymbol selectionRange points at the label", () => {
  const symbols = documentSymbols(SRC);
  const script = symbols[0];
  assert.deepEqual(script.selectionRange, {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 7 }, // "script:" is 7 chars
  });
});

test("documentSymbol of empty source is empty", () => {
  assert.deepEqual(documentSymbols(""), []);
});

test("foldingRange produces one region per multi-line block", () => {
  const folds = foldingRanges(SRC);
  assert.equal(folds.length, 3);
  assert.equal(folds[0].startLine, 0);
  assert.equal(folds[0].endLine, 1);
  assert.equal(folds[0].kind, "region");
});

test("foldingRange omits single-line blocks", () => {
  // `html:` has no body -> not foldable; `style:` spans two lines -> foldable.
  const src = "html:\nstyle:\n  p{}";
  const folds = foldingRanges(src);
  assert.equal(folds.length, 1);
  assert.equal(folds[0].startLine, 1);
});

test("selectionRange widens: interpolation inner -> interp -> body -> block", () => {
  // Position on `name` inside `${ name }` on line 3.
  const line = "  <p>${ name }</p>";
  const character = line.indexOf("name") + 1;
  const range = selectionRangeAt(SRC, { line: 3, character });

  // Innermost: the interpolation inner (between braces).
  assert.equal(range.range.start.character, line.indexOf("{") + 1);
  // Walk the parent chain; each parent must enclose its child and widen.
  const chain = [];
  let cur = range;
  while (cur) {
    chain.push(cur.range);
    cur = cur.parent;
  }
  assert.ok(chain.length >= 3, "expected several nesting levels");
  // Outermost is the whole html block starting at line 2.
  assert.equal(chain[chain.length - 1].start.line, 2);
});

test("selectionRange outside any block returns a degenerate range", () => {
  const src = "plain\ntext";
  const pos = { line: 0, character: 2 };
  const range = selectionRangeAt(src, pos);
  assert.deepEqual(range.range, { start: pos, end: pos });
  assert.equal(range.parent, undefined);
});

test("selectionRange parents strictly enclose children", () => {
  const character = "  <p>${ name }</p>".indexOf("name") + 1;
  let cur = selectionRangeAt(SRC, { line: 3, character });
  while (cur.parent) {
    const child = cur.range;
    const parent = cur.parent.range;
    const parentStartsBefore =
      parent.start.line < child.start.line ||
      (parent.start.line === child.start.line &&
        parent.start.character <= child.start.character);
    const parentEndsAfter =
      parent.end.line > child.end.line ||
      (parent.end.line === child.end.line &&
        parent.end.character >= child.end.character);
    assert.ok(parentStartsBefore && parentEndsAfter, "parent must enclose child");
    cur = cur.parent;
  }
});
