// Thorough tests for the UTF-8-byte -> line/UTF-16-column mapping.
// Run: node --test test/  (after `pnpm build`)
import { test } from "node:test";
import assert from "node:assert/strict";
import { LineIndex } from "../dist/line-index.js";

const pos = (line, character) => ({ line, character });

test("empty source", () => {
  const idx = new LineIndex("");
  assert.equal(idx.byteLength, 0);
  assert.deepEqual(idx.positionAt(0), pos(0, 0));
});

test("single-line ASCII maps 1:1", () => {
  const idx = new LineIndex("abc");
  assert.equal(idx.byteLength, 3);
  assert.deepEqual(idx.positionAt(0), pos(0, 0));
  assert.deepEqual(idx.positionAt(1), pos(0, 1));
  assert.deepEqual(idx.positionAt(2), pos(0, 2));
  assert.deepEqual(idx.positionAt(3), pos(0, 3)); // end-of-file
});

test("newline advances the line and resets the column", () => {
  const idx = new LineIndex("ab\ncd");
  assert.deepEqual(idx.positionAt(0), pos(0, 0));
  assert.deepEqual(idx.positionAt(2), pos(0, 2)); // the '\n' itself
  assert.deepEqual(idx.positionAt(3), pos(1, 0)); // 'c'
  assert.deepEqual(idx.positionAt(4), pos(1, 1)); // 'd'
  assert.deepEqual(idx.positionAt(5), pos(1, 2)); // end of second line
});

test("trailing newline yields an empty final line", () => {
  const idx = new LineIndex("a\n");
  assert.deepEqual(idx.positionAt(1), pos(0, 1)); // the '\n'
  assert.deepEqual(idx.positionAt(2), pos(1, 0)); // empty line 1
});

test("2-byte UTF-8 (é) is one UTF-16 unit", () => {
  const idx = new LineIndex("éx"); // é = U+00E9, 2 bytes
  assert.equal(idx.byteLength, 3);
  assert.deepEqual(idx.positionAt(0), pos(0, 0));
  assert.deepEqual(idx.positionAt(2), pos(0, 1)); // 'x'
  assert.deepEqual(idx.positionAt(3), pos(0, 2)); // end
});

test("3-byte UTF-8 (CJK) is one UTF-16 unit", () => {
  const idx = new LineIndex("あい"); // each = U+3042.., 3 bytes
  assert.equal(idx.byteLength, 6);
  assert.deepEqual(idx.positionAt(0), pos(0, 0));
  assert.deepEqual(idx.positionAt(3), pos(0, 1)); // second char
  assert.deepEqual(idx.positionAt(6), pos(0, 2)); // end
});

test("4-byte UTF-8 (emoji) is two UTF-16 units", () => {
  const idx = new LineIndex("a😀b"); // 😀 = U+1F600, 4 bytes / 2 units
  assert.equal(idx.byteLength, 6);
  assert.deepEqual(idx.positionAt(0), pos(0, 0)); // 'a'
  assert.deepEqual(idx.positionAt(1), pos(0, 1)); // emoji start
  assert.deepEqual(idx.positionAt(5), pos(0, 3)); // 'b' (1 + 2 units)
  assert.deepEqual(idx.positionAt(6), pos(0, 4)); // end
});

test("offset inside a multi-byte character snaps to its start", () => {
  const idx = new LineIndex("a😀b");
  // Bytes 2,3,4 fall inside the emoji; all snap to the emoji's start.
  assert.deepEqual(idx.positionAt(2), pos(0, 1));
  assert.deepEqual(idx.positionAt(3), pos(0, 1));
  assert.deepEqual(idx.positionAt(4), pos(0, 1));
});

test("multi-byte char before a newline", () => {
  const idx = new LineIndex("é\nb"); // é(2) \n(1) b(1)
  assert.deepEqual(idx.positionAt(2), pos(0, 1)); // the '\n'
  assert.deepEqual(idx.positionAt(3), pos(1, 0)); // 'b'
  assert.deepEqual(idx.positionAt(4), pos(1, 1)); // end
});

test("out-of-range offsets clamp to [0, byteLength]", () => {
  const idx = new LineIndex("abc");
  assert.deepEqual(idx.positionAt(-10), pos(0, 0));
  assert.deepEqual(idx.positionAt(999), pos(0, 3));
});

test("rangeAt maps both endpoints", () => {
  const idx = new LineIndex("ab\ncd");
  assert.deepEqual(idx.rangeAt(1, 4), {
    start: pos(0, 1),
    end: pos(1, 1),
  });
});

test("positionU16At maps UTF-16 offsets across lines", () => {
  const idx = new LineIndex("ab\ncd");
  assert.deepEqual(idx.positionU16At(0), pos(0, 0));
  assert.deepEqual(idx.positionU16At(2), pos(0, 2)); // the '\n'
  assert.deepEqual(idx.positionU16At(3), pos(1, 0)); // 'c'
  assert.deepEqual(idx.positionU16At(5), pos(1, 2)); // end
});

test("positionU16At counts an emoji as two UTF-16 units", () => {
  const idx = new LineIndex("a😀b"); // a(1) 😀(2) b(1) -> 4 UTF-16 units
  assert.deepEqual(idx.positionU16At(0), pos(0, 0)); // 'a'
  assert.deepEqual(idx.positionU16At(1), pos(0, 1)); // emoji start
  assert.deepEqual(idx.positionU16At(3), pos(0, 3)); // 'b'
  assert.deepEqual(idx.positionU16At(4), pos(0, 4)); // end
});

test("positionU16At snaps inside a surrogate pair to its start", () => {
  const idx = new LineIndex("a😀b");
  // Offset 2 lands between the surrogate halves; snaps back to the emoji start.
  assert.deepEqual(idx.positionU16At(2), pos(0, 1));
});

test("positionU16At clamps out-of-range offsets", () => {
  const idx = new LineIndex("abc");
  assert.deepEqual(idx.positionU16At(-5), pos(0, 0));
  assert.deepEqual(idx.positionU16At(99), pos(0, 3));
});

test("realistic .lunas-shaped source", () => {
  const src = ["html:", '  <p>{ msg }</p>', "script:", "  let msg = 'あ'"].join(
    "\n",
  );
  const idx = new LineIndex(src);
  // Start of each line.
  assert.deepEqual(idx.positionAt(0), pos(0, 0));
  assert.deepEqual(idx.positionAt(src.indexOf("<p>")), pos(1, 2));
  assert.deepEqual(idx.positionAt(src.indexOf("script:")), pos(2, 0));
  // Column past the multi-byte 'あ' stays consistent.
  const aIdxBytes = Buffer.byteLength(src.slice(0, src.indexOf("あ")), "utf8");
  assert.deepEqual(idx.positionAt(aIdxBytes), pos(3, 13));
});
