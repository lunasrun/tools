# lunas-tools

Editor & build tooling for the [Lunas](https://github.com/lunasrun/lunas) web
framework, developed as a single pnpm workspace.

| package | what it is |
|---|---|
| [`@lunas-tools/wasm`](packages/wasm) | the compiler seam — wraps the Rust `lunas_wasm` bindings behind a stable JS API (`compile`, diagnostics, `LineIndex`). The only package that touches the compiler. |
| [`@lunas-tools/grammar`](packages/grammar) | TextMate grammar + language configuration for `.lunas` files (syntax highlighting). |
| [`lunas-ls`](packages/language-server) | the Lunas language server (LSP), for both Node (stdio) and the browser (web worker). |
| [`lunas-tsc`](packages/tsc) | CLI diagnostics / type-checker for `.lunas` files. |
| [`lunas-vscode`](packages/vscode) | the VS Code extension (desktop + web). |

## Getting started

```sh
# Node 22 (see .nvmrc); pnpm via corepack
corepack enable
git submodule update --init --recursive   # vendors external/lunas
pnpm install
pnpm wasm:build                            # build the compiler bindings once
pnpm -r build && pnpm -r test
```

The Rust compiler lives in the sibling `lunasrun/lunas` repo and is vendored as
a git submodule at `external/lunas`. See [`CLAUDE.md`](CLAUDE.md) for the
compiler-seam design and the development workflow.

## Status

Bootstrapping. Package skeletons and CI are in place; feature work is tracked in
[`roadmap.yml`](roadmap.yml).

## License

MIT
