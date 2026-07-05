/**
 * A small, dependency-free structural scanner for `.lunas` single-file
 * components. It does **no** semantics — no parsing of TS/JS/CSS/HTML — it only
 * finds the coarse structure the editor needs for outlines and folding:
 *
 * - top-level blocks introduced by a `html:`, `style:` or `script:` label at
 *   column 0, whose body is the following more-indented (or blank) lines, and
 * - `${ … }` interpolations inside those blocks (with brace nesting).
 *
 * Everything is reported in **UTF-16 code-unit offsets** into the source (the
 * unit editors and `LineIndex` use for character columns), so ranges map
 * straight onto LSP positions without another encoding hop.
 *
 * The scanner is intentionally forgiving: missing blocks, an unterminated
 * interpolation, CRLF line endings and multibyte characters must never throw —
 * a best-effort structure is always returned.
 */

/** The recognised top-level block kinds, in the order Lunas conventionally uses. */
export type BlockKind = "script" | "html" | "style";

/** The set of labels that introduce a top-level block. */
const BLOCK_LABELS: Record<string, BlockKind> = {
  "script:": "script",
  "html:": "html",
  "style:": "style",
};

/** A half-open span of UTF-16 code-unit offsets: `[start, end)`. */
export interface Span {
  /** Inclusive start offset (UTF-16 code units). */
  start: number;
  /** Exclusive end offset (UTF-16 code units). */
  end: number;
}

/** A `${ … }` interpolation found inside a block body. */
export interface Interpolation extends Span {
  /** Span of the text between the braces (exclusive of `${` and `}`). */
  inner: Span;
}

/** A top-level block: its label line plus the indented body that follows. */
export interface Block extends Span {
  kind: BlockKind;
  /** The exact label text, e.g. `"html:"`. */
  label: string;
  /** Span of the label token on the opening line. */
  labelSpan: Span;
  /** Span covering only the body lines (empty span when the block has no body). */
  bodySpan: Span;
  /** Interpolations discovered within the body, in source order. */
  interpolations: Interpolation[];
}

/** The full structural view of a `.lunas` source. */
export interface Structure {
  blocks: Block[];
}

/** Count the leading space/tab characters of a line slice. */
function leadingIndent(source: string, lineStart: number, lineEnd: number): number {
  let i = lineStart;
  while (i < lineEnd) {
    const c = source.charCodeAt(i);
    if (c === 0x20 /* space */ || c === 0x09 /* tab */) i++;
    else break;
  }
  return i - lineStart;
}

/** True when the slice `[start, end)` is empty or only whitespace. */
function isBlank(source: string, start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    const c = source.charCodeAt(i);
    if (c !== 0x20 && c !== 0x09 && c !== 0x0d && c !== 0x0a) return false;
  }
  return true;
}

/**
 * Split `source` into line records. Each record spans the line content
 * (excluding the terminator) and separately records where the terminator ends,
 * so both `\n` and `\r\n` are handled without rewriting the source.
 */
interface Line {
  /** Offset of the first character of the line. */
  start: number;
  /** Offset just past the last content character (before any `\r`/`\n`). */
  contentEnd: number;
  /** Offset just past the line terminator (== next line's `start`). */
  end: number;
}

function splitLines(source: string): Line[] {
  const lines: Line[] = [];
  const n = source.length;
  let i = 0;
  while (i <= n) {
    const start = i;
    // Advance to the next line terminator or EOF.
    while (i < n) {
      const c = source.charCodeAt(i);
      if (c === 0x0a || c === 0x0d) break;
      i++;
    }
    const contentEnd = i;
    // Consume the terminator (\n, \r, or \r\n).
    if (i < n) {
      const c = source.charCodeAt(i);
      if (c === 0x0d && i + 1 < n && source.charCodeAt(i + 1) === 0x0a) i += 2;
      else i += 1;
    } else {
      // At EOF: emit the final (possibly empty) line only if the source is
      // non-empty or this is the very first line, then stop.
      lines.push({ start, contentEnd, end: i });
      break;
    }
    lines.push({ start, contentEnd, end: i });
  }
  return lines;
}

/** Match a block label at the start of a line's content (after no indent). */
function matchLabel(
  source: string,
  line: Line,
): { kind: BlockKind; label: string; labelSpan: Span } | null {
  // A label must sit at column 0 (no leading indent).
  if (leadingIndent(source, line.start, line.contentEnd) !== 0) return null;
  const text = source.slice(line.start, line.contentEnd);
  for (const label of Object.keys(BLOCK_LABELS)) {
    if (!text.startsWith(label)) continue;
    // Only whitespace may follow the label on the opening line.
    const rest = text.slice(label.length);
    if (rest.trim() !== "") continue;
    return {
      kind: BLOCK_LABELS[label],
      label,
      labelSpan: { start: line.start, end: line.start + label.length },
    };
  }
  return null;
}

/**
 * Find `${ … }` interpolations within `[start, end)` of `source`, tracking brace
 * nesting so `${ a.map(x => ({ x })) }` is a single interpolation. Unterminated
 * interpolations are reported through end-of-range (never dropped, never
 * thrown). String and comment awareness is deliberately out of scope: this is a
 * structural aid, not a JS parser.
 */
export function findInterpolations(
  source: string,
  start: number,
  end: number,
): Interpolation[] {
  const result: Interpolation[] = [];
  let i = start;
  while (i < end) {
    // An interpolation opens with `${` — a `$` immediately followed by `{`.
    if (
      source.charCodeAt(i) === 0x24 /* $ */ &&
      i + 1 < end &&
      source.charCodeAt(i + 1) === 0x7b /* { */
    ) {
      const open = i; // the `$`
      let depth = 1;
      let j = i + 2; // scan the body after `${`
      while (j < end && depth > 0) {
        const c = source.charCodeAt(j);
        if (c === 0x7b) depth++;
        else if (c === 0x7d /* } */) depth--;
        j++;
      }
      // `j` is now just past the matching `}` (or at `end` if unterminated).
      const closed = depth === 0;
      const innerEnd = closed ? j - 1 : end;
      result.push({
        start: open,
        end: closed ? j : end,
        inner: { start: open + 2, end: innerEnd },
      });
      i = j;
    } else {
      i++;
    }
  }
  return result;
}

/**
 * Scan a `.lunas` source into its coarse {@link Structure}.
 *
 * Pure and total: any string in, a best-effort structure out. Offsets are
 * UTF-16 code units.
 */
export function scanStructure(source: string): Structure {
  const lines = splitLines(source);
  const blocks: Block[] = [];

  let li = 0;
  while (li < lines.length) {
    const line = lines[li];
    const matched = matchLabel(source, line);
    if (!matched) {
      li++;
      continue;
    }

    // Collect the body: subsequent lines that are blank or indented past
    // column 0. A non-blank line at column 0 ends the block.
    const bodyStart = line.end;
    let bodyEnd = line.contentEnd; // default: no body -> empty span at label EOL
    let k = li + 1;
    while (k < lines.length) {
      const l = lines[k];
      const blank = isBlank(source, l.start, l.contentEnd);
      const indent = leadingIndent(source, l.start, l.contentEnd);
      if (!blank && indent === 0) break; // next top-level construct
      bodyEnd = l.contentEnd;
      k++;
    }

    const hasBody = k > li + 1;
    const body: Span = hasBody
      ? { start: bodyStart, end: bodyEnd }
      : { start: line.contentEnd, end: line.contentEnd };

    blocks.push({
      kind: matched.kind,
      label: matched.label,
      start: line.start,
      end: hasBody ? bodyEnd : line.contentEnd,
      labelSpan: matched.labelSpan,
      bodySpan: body,
      interpolations: hasBody
        ? findInterpolations(source, body.start, body.end)
        : [],
    });

    li = k;
  }

  return { blocks };
}
