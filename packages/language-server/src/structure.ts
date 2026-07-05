/**
 * Derives the LSP structural features that need no semantics — document
 * symbols, folding ranges and selection ranges — from the {@link scanStructure}
 * output. All offset→position mapping goes through {@link LineIndex} so the
 * UTF-16 columns line up with the rest of the server.
 */
import {
  DocumentSymbol,
  FoldingRange,
  FoldingRangeKind,
  SelectionRange,
  SymbolKind,
  type Position,
  type Range,
} from "vscode-languageserver-types";
import { LineIndex } from "@lunas-tools/wasm";
import { scanStructure, type Block, type BlockKind, type Span } from "./scanner.js";

/** Convert a UTF-16 offset {@link Span} into an LSP {@link Range}. */
function toRange(index: LineIndex, span: Span): Range {
  return {
    start: index.positionU16At(span.start),
    end: index.positionU16At(span.end),
  };
}

/** A human-friendly label for each block kind, used as the symbol name. */
const BLOCK_SYMBOL_NAME: Record<BlockKind, string> = {
  script: "script",
  html: "html",
  style: "style",
};

/** LSP symbol kind per block; picked to give each block a distinct outline icon. */
const BLOCK_SYMBOL_KIND: Record<BlockKind, SymbolKind> = {
  script: SymbolKind.Module,
  html: SymbolKind.Namespace,
  style: SymbolKind.Object,
};

/**
 * Build a `documentSymbol` outline: one top-level symbol per block, with each
 * `${ … }` interpolation nested beneath its block.
 */
export function documentSymbols(source: string): DocumentSymbol[] {
  const index = new LineIndex(source);
  const { blocks } = scanStructure(source);
  return blocks.map((block) => {
    const range = toRange(index, block);
    const selectionRange = toRange(index, block.labelSpan);
    const children: DocumentSymbol[] = block.interpolations.map((interp, i) => {
      const interpRange = toRange(index, interp);
      return {
        name: `\${ … } #${i + 1}`,
        kind: SymbolKind.Variable,
        range: interpRange,
        selectionRange: interpRange,
      };
    });
    return {
      name: BLOCK_SYMBOL_NAME[block.kind],
      detail: block.label,
      kind: BLOCK_SYMBOL_KIND[block.kind],
      range,
      selectionRange,
      children: children.length > 0 ? children : undefined,
    };
  });
}

/**
 * Build `foldingRange`s: one region per block (label line through end of body).
 * A block with no body (or a single body line) is not foldable and is omitted.
 */
export function foldingRanges(source: string): FoldingRange[] {
  const index = new LineIndex(source);
  const { blocks } = scanStructure(source);
  const ranges: FoldingRange[] = [];
  for (const block of blocks) {
    const start = index.positionU16At(block.start);
    const end = index.positionU16At(block.end);
    // Folding is line-based; only worthwhile when it spans >1 line.
    if (end.line <= start.line) continue;
    ranges.push({
      startLine: start.line,
      endLine: end.line,
      kind: FoldingRangeKind.Region,
    });
  }
  return ranges;
}

/** Whether `pos` falls within `[range.start, range.end)` (line/char order). */
function contains(range: Range, pos: Position): boolean {
  return !before(pos, range.start) && before(pos, range.end);
}

/** True when `a` is strictly before `b`. */
function before(a: Position, b: Position): boolean {
  if (a.line !== b.line) return a.line < b.line;
  return a.character < b.character;
}

/**
 * Build a `selectionRange` for one position: the smallest enclosing span
 * (interpolation inner → interpolation → block body → block) wrapped outward as
 * a parent chain, which is how editors expand/shrink the selection.
 */
export function selectionRangeAt(source: string, pos: Position): SelectionRange {
  const index = new LineIndex(source);
  const { blocks } = scanStructure(source);

  // Ordered outermost → innermost list of spans enclosing `pos`.
  const spans: Span[] = [];
  const block = findEnclosingBlock(index, blocks, pos);
  if (block) {
    spans.push(block);
    if (
      block.bodySpan.end > block.bodySpan.start &&
      contains(toRange(index, block.bodySpan), pos)
    ) {
      spans.push(block.bodySpan);
    }
    for (const interp of block.interpolations) {
      if (contains(toRange(index, interp), pos)) {
        spans.push(interp);
        if (contains(toRange(index, interp.inner), pos)) spans.push(interp.inner);
        break;
      }
    }
  }

  // Fold the outermost → innermost spans into a nested SelectionRange whose
  // `.parent` chain widens the selection.
  let current: SelectionRange | undefined;
  for (const span of spans) {
    current = { range: toRange(index, span), parent: current };
  }
  // When nothing encloses the position, return a degenerate range at `pos`.
  return current ?? { range: { start: pos, end: pos } };
}

/** The innermost block whose full range contains `pos`, if any. */
function findEnclosingBlock(
  index: LineIndex,
  blocks: Block[],
  pos: Position,
): Block | undefined {
  for (const block of blocks) {
    if (contains(toRange(index, block), pos)) return block;
  }
  return undefined;
}
