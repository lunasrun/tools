# lunas-playground

The in-browser editor & live preview for [Lunas](https://github.com/lunasrun/lunas)
`.lunas` single-file components — **built with Lunas itself**. The playground UI
is authored in `.lunas` and compiled by the real Lunas compiler.

## Getting started

```sh
# Node 22 (see .nvmrc); pnpm via corepack
corepack enable
git submodule update --init --recursive   # vendors external/lunas
pnpm install
pnpm wasm:build                            # build the compiler bindings once
pnpm dev                                   # start the playground
```

Quality gate:

```sh
pnpm build && pnpm typecheck && pnpm test
```

## How it consumes Lunas

Lunas is not published to npm yet, so the framework is vendored as a git
submodule at `external/lunas` and consumed from there:

- `package.json` depends on `lunas` (runtime) and `vite-plugin-lunas` (the Vite
  plugin that compiles `.lunas`) via the `file:` protocol into the submodule.
- `pnpm wasm:build` runs `wasm-pack` on `external/lunas/crates/lunas_wasm` into
  `wasm/{node,web}` — the `node` target drives the Vite build, the `web` target
  runs the compiler in the browser.

When Lunas publishes to npm, the two `file:` deps swap for pinned npm versions
and the local wasm build goes away — see [`CLAUDE.md`](CLAUDE.md) for the
compiler-seam design, rules, and workflow.

## Status

Scaffolded: a single Vite app compiling `.lunas` end-to-end. Feature work is
tracked in [`roadmap.yml`](roadmap.yml).

## License

MIT
