# CLAUDE.md

## Project

`lunas-playground` — the in-browser editor & live preview for
[Lunas](https://github.com/lunasrun/lunas) `.lunas` single-file components.
The playground is **built with Lunas itself** (dogfooding): its UI is authored
in `.lunas` components, compiled by the real Lunas compiler.

Goals, in order (one PR per step, merged before the next):

1. **Scaffold** — a single Vite app consuming Lunas (this repo, done).
2. **Playground UI in Lunas** — reproduce the previous Material-ish look
   (reference the archived Vue playground in the sibling `lunas-playground`
   checkout) with VS Code-like multi-file management and live in-browser compile.
3. **Editor + language server** — Monaco with syntax highlighting, wired to the
   Lunas language server (restored from this repo's git history) over a worker.
4. **Deploy** — GitHub Pages on push to `main`.

## The compiler seam (read before touching the Lunas dependency)

The Lunas compiler & runtime live in the
[`lunasrun/lunas`](https://github.com/lunasrun/lunas) repo, vendored here as a
git submodule at `external/lunas`. Lunas is **not published to npm yet**, so we
consume it from the submodule, switched in **one place** so the eventual npm
switch is local:

- **Now:** `package.json` pulls the framework packages from the submodule with
  the `file:` protocol — `lunas` (runtime) and `vite-plugin-lunas` (the Vite
  plugin that compiles `.lunas`). The plugin needs the compiler as wasm:
  `pnpm wasm:build` runs `wasm-pack` on `external/lunas/crates/lunas_wasm` and
  writes `wasm/{node,web}` (git-ignored, rebuilt from the submodule).
  - `wasm/node` (wasm-pack `nodejs` target) is what the Vite plugin loads at
    build time; `vite.config.ts` points the plugin at it via `wasmPkgPath`.
  - `wasm/web` (wasm-pack `web` target) runs in the browser to compile `.lunas`
    sources live in the playground.
- **Later (after Lunas publishes):** swap the two `file:` deps for the published
  npm versions (pinned in `package.json`) and drop the local wasm build. Nothing
  else changes.

Because building wasm is heavy, the fast tests **must not** require the real
binary: `vite-plugin-lunas` accepts an injected fake compiler, and
`test/plugin.test.mjs` uses it to verify our wiring without wasm. The real
compiler is exercised by `pnpm build` (CI builds the wasm, then the app).

## Rules (non-negotiable)

1. **No absolute paths, anywhere.** Not in code, configs, scripts, tests, docs,
   or CI. Reference things by path relative to the repo/package root (and
   `import.meta.url`-relative resolution in code), or by project/repo name
   (`external/lunas`, `lunasrun/lunas`). A hardcoded `/Users/...`, `/home/...`,
   or `C:\...` is a bug — CI and every contributor run elsewhere.
2. **One PR per change; never push to `main` directly.** Branch naming drives
   auto-labeling (`add-labels.yml`) and release notes: `feat/`, `fix/`,
   `refactor/`, `chore/`, `docs/`, `version/`.
3. **Merge aggressively once green.** When required checks pass, squash-merge
   without asking. Enable auto-merge (`gh pr merge --squash --auto`). Merge
   sequentially; rebase follow-ups on fresh `main`. **Never merge a red PR.**
4. **Test thoroughly; QA is the gate.** New behavior ships with tests. Prefer
   fast, dependency-light tests (`node --test`, `.mjs`) that run without the
   wasm binary. The quality gate before **any** PR: `pnpm build`,
   `pnpm typecheck`, `pnpm test` all green (run `pnpm wasm:build` first on a
   fresh checkout).
5. **Release PRs are automated.** On every push to `main`, `pr-release-beta.yml`
   runs `.github/scripts/release-pr.mjs` to create/update a single release PR
   from `main` into `beta`, categorized by PR label. Don't hand-edit the release
   PR body format — change the script.

## Development workflow (autonomous)

Claude drives development from `roadmap.yml`:

1. **Pick a `todo` item**, respecting dependency order (scaffold → playground UI
   → editor/LSP → deploy).
2. **Branch → implement + tests → quality gate → `gh pr create` → enable
   auto-merge.** Keep `main` green; rebase follow-ups on fresh `main`.
3. **`roadmap.yml` edits ride inside the feature PR** that completes them — flip
   only your own item lines to `done`.

## Conventions

- TypeScript, ESM, Node ≥ 18 (CI pins Node 22, matching Lunas). Tests use
  `node --test`.
- The Lunas submodule is the single boundary to the compiler/runtime — never
  reach into `external/lunas` internals from app code; consume the `lunas` and
  `vite-plugin-lunas` packages.
- Commit style: `feat(playground): …`, `fix(editor): …`, `chore(ci): …`.
