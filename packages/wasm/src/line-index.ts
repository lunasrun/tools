/**
 * Maps UTF-8 byte offsets (how the compiler reports spans) to line/column
 * positions (how editors and the LSP address text).
 *
 * The compiler emits **UTF-8 byte offsets**. The LSP addresses text by line and
 * **UTF-16 code unit** column (the default `PositionEncodingKind`). Those three
 * units — byte, code point, UTF-16 unit — only coincide for ASCII, so this
 * conversion is where multi-byte characters (accents, CJK, emoji) get handled
 * correctly. It is deliberately dependency-free and heavily tested.
 */

/** A zero-based line/character position (character is a UTF-16 unit offset). */
export interface Position {
  line: number;
  character: number;
}

/** A start/end pair of {@link Position}s. */
export interface Range {
  start: Position;
  end: Position;
}

/** UTF-8 encoded byte length of a Unicode code point. */
function utf8Len(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

/** UTF-16 code unit length of a Unicode code point. */
function utf16Len(codePoint: number): number {
  return codePoint > 0xffff ? 2 : 1;
}

export class LineIndex {
  /** UTF-8 byte offset at the start of each code point, plus a final sentinel. */
  private readonly byteOffsets: number[] = [];
  /** UTF-16 unit offset at the start of each code point, plus a final sentinel. */
  private readonly u16Offsets: number[] = [];
  /** Line number of each code point (parallel to the arrays above). */
  private readonly lineOf: number[] = [];
  /** UTF-16 unit offset at the start of each line. */
  private readonly lineStartU16: number[] = [0];
  /** Total number of UTF-8 bytes in the source. */
  private readonly totalBytes: number;

  constructor(source: string) {
    let byte = 0;
    let u16 = 0;
    let line = 0;

    // `for...of` iterates by Unicode code point, collapsing surrogate pairs.
    for (const ch of source) {
      const cp = ch.codePointAt(0)!;
      this.byteOffsets.push(byte);
      this.u16Offsets.push(u16);
      this.lineOf.push(line);

      byte += utf8Len(cp);
      u16 += utf16Len(cp);

      if (cp === 0x0a) {
        // '\n' terminates the current line; the next unit starts a new one.
        line += 1;
        this.lineStartU16.push(u16);
      }
    }

    // Sentinel entry for the end-of-file position.
    this.byteOffsets.push(byte);
    this.u16Offsets.push(u16);
    this.lineOf.push(line);
    this.totalBytes = byte;
  }

  /** Number of bytes in the indexed source. */
  get byteLength(): number {
    return this.totalBytes;
  }

  /**
   * Convert a UTF-8 byte offset into a line/character position.
   *
   * Out-of-range offsets are clamped to `[0, byteLength]`. An offset that lands
   * inside a multi-byte character snaps to that character's start.
   */
  positionAt(byteOffset: number): Position {
    const clamped = Math.max(0, Math.min(byteOffset, this.totalBytes));

    // Largest index whose byte offset is <= the target.
    let lo = 0;
    let hi = this.byteOffsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.byteOffsets[mid] <= clamped) lo = mid;
      else hi = mid - 1;
    }

    const line = this.lineOf[lo];
    const character = this.u16Offsets[lo] - this.lineStartU16[line];
    return { line, character };
  }

  /** Convert a start/end byte range into a line/character {@link Range}. */
  rangeAt(startByte: number, endByte: number): Range {
    return {
      start: this.positionAt(startByte),
      end: this.positionAt(endByte),
    };
  }
}
