# CLAUDE.md

## Project

`lunas-tools` — the editor & build tooling around the [Lunas](https://github.com/lunasrun/lunas)
web framework. A pnpm workspace of independently published packages:

| package | name | role |
|---|---|---|
| `packages/wasm` | `@lunas-tools/wasm` | the **only** place that touches the Rust compiler. Wraps `lunas_wasm` (compiled with `wasm-pack`) behind a stable JS API (`compile`, diagnostic types, `LineIndex`). Everything else imports from here. |
| `packages/grammar` | `@lunas-tools/grammar` | TextMate grammar + language configuration for `.lunas` (syntax highlighting). |
| `packages/language-server` | `lunas-ls` | the Lunas language server (LSP). Ships **both** a Node entry (stdio) and a browser entry (web worker). |
| `packages/tsc` | `lunas-tsc` | CLI diagnostics/type-checker for `.lunas` files (svelte-check / vue-tsc style). |
| `packages/vscode` | `lunas-vscode` | the VS Code extension: bundles the grammar and launches `lunas-ls` (desktop **and** web extension host). |

- **Roadmap:** `roadmap.yml` at the repo root is the single source of truth.
  Statuses: `done` / `in_progress` / `todo` / `deferred`. Mirrors the Lunas
  roadmap convention.
- **File extension:** Lunas single-file components use **`.lunas`** only. Do not
  reintroduce the legacy `.lun` extension anywhere in this repo.

## The compiler seam (read before touching `packages/wasm`)

The Rust compiler lives in the sibling [`lunasrun/lunas`](https://github.com/lunasrun/lunas)
repo, vendored here as a git submodule at `external/lunas`. Two supply modes,
by design, switched in **one place** (`packages/wasm`) so nothing downstream
changes:

- **Development / now:** build `external/lunas/crates/lunas_wasm` with
  `wasm-pack` (`pnpm wasm:build`) and re-export the generated bindings.
- **Later (after Lunas publishes):** `@lunas-tools/wasm` will depend on the
  published `@lunas/wasm` npm package, pinned by **version in its
  `package.json`**. Downstream packages already import `@lunas-tools/wasm`, so
  the switch is local.

Because building wasm is heavy, downstream tests must **not** require the real
binary: they inject a fake compiler through the `@lunas-tools/wasm` interface.
The real-binary path is exercised by an opt-in integration test that skips
loudly when `packages/wasm/generated/` is absent (mirrors Lunas's
mock-compiler pattern).

## Rules (non-negotiable)

1. **No absolute paths, anywhere.** Not in code, configs, scripts, tests,
   docs, or CI. Use paths relative to the package or repo root (and
   `import.meta.url` / `__dirname`-relative resolution in code). A hardcoded
   `/Users/...`, `/home/...`, or `C:\...` is a bug — CI runs elsewhere and so
   does every contributor. The submodule is referenced as `external/lunas`,
   never by an on-disk absolute path.
2. **One PR per change; never push to `main` directly.** Every change lands via
   a PR. Branch naming drives auto-labeling (`add-labels.yml`) and release
   notes: `feat/`, `fix/`, `refactor/`, `chore/`, `docs/`, `version/`.
3. **Merge aggressively once green.** Merging is pre-authorized — when required
   checks pass, squash-merge without asking. Enable auto-merge
   (`gh pr merge --squash --auto`) so a PR merges the moment CI goes green.
   Merge sequentially; rebase follow-ups on fresh `main`. **Never merge a red
   PR.**
4. **Test thoroughly; QA is the gate.** New behavior ships with tests. Prefer
   fast, dependency-light tests (`node --test`, `.mjs`) that run without the
   wasm binary. Cover the tricky bits deliberately: byte-offset → line/column
   mapping, diagnostic severity mapping, CLI exit codes, LSP message shapes,
   grammar tokenization. The quality gate before **any** PR: `pnpm -r build`,
   `pnpm -r typecheck`, `pnpm -r test` all green.
5. **Release PRs are automated.** On every push to `main`,
   `pr-release-beta.yml` runs `.github/scripts/release-pr.mjs` to create/update
   a single release PR from `main` into `beta`, categorized by PR label. Adapted
   from the Lunas repo's release automation. Don't hand-edit the release PR
   body format — change the script.

## Development workflow (autonomous)

Claude drives development from `roadmap.yml`:

1. **Pick a `todo` item**, respecting dependency order (compiler seam →
   grammar → language server / tsc → vscode).
2. **Parallelize independent features** with background subagents using
   `isolation: "worktree"`; pick model by difficulty.
3. **Branch → implement + tests → quality gate → `gh pr create` → enable
   auto-merge.** The orchestrator keeps `main` green and rebases follow-ups.
4. **`roadmap.yml` edits ride inside the feature PR** that completes them —
   flip only your own item lines to `done`.

## Conventions

- TypeScript, ESM, Node ≥ 18 (CI pins Node 22, matching Lunas). Package tests
  use `node --test`.
- `@lunas-tools/wasm` is the single boundary to the compiler — never import
  from `external/lunas` or reach into generated bindings elsewhere.
- Commit style: `feat(tsc): …`, `fix(ls): …`, `chore(ci): …`.
- Keep packages independently buildable; shared config lives in
  `tsconfig.base.json`.
