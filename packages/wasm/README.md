# @lunas-tools/wasm

The **compiler seam** for the Lunas tooling. This is the only package that
touches the Rust compiler; every other tool imports from here.

```ts
import { loadCompiler, LineIndex } from "@lunas-tools/wasm";

const compile = loadCompiler();
const { code, diagnostics } = compile(source);

const index = new LineIndex(source);
for (const d of diagnostics) {
  const range = index.rangeAt(d.start, d.end); // byte offsets -> line/column
}
```

## What it provides

- **Types** — `Diagnostic`, `CompileResult`, `Severity`, `Compile`.
- **`LineIndex`** — maps the compiler's UTF-8 byte offsets to editor line /
  UTF-16-column positions (handles accents, CJK, emoji).
- **`loadCompiler()` / `isCompilerAvailable()`** — load the real compiler
  (Node target), or detect whether it has been built.

## Supplying the compiler

Two modes, switched only inside this package (`src/loader.ts`):

- **Now / development:** `pnpm wasm:build` compiles
  `external/lunas/crates/lunas_wasm` with `wasm-pack` into `generated/{node,web}`.
- **Later:** depend on the published `@lunas/wasm` npm package, pinned by
  version in this package's `package.json`.

Downstream tests never need the binary — they inject a fake `Compile` function.
