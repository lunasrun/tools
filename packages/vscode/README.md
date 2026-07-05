# lunas-vscode

VS Code language support for [Lunas](https://github.com/lunasrun/lunas) —
syntax highlighting (and, soon, diagnostics via `lunas-ls`) for `.lunas`
single-file components. Works in both the desktop and web (vscode.dev) hosts.

## Features

- Syntax highlighting for `.lunas` files, with embedded highlighting for the
  `html:`, `style:`, and `script:` blocks and `{ … }` interpolations.
- Language configuration: comments, brackets, auto-closing pairs.

Live diagnostics and richer language features (via the `lunas-ls` client) are on
the roadmap.

## Development

```sh
pnpm --filter lunas-vscode build   # sync grammar + bundle with esbuild
```

The TextMate grammar is the single source in `@lunas-tools/grammar`; the build
syncs it into `syntaxes/` (git-ignored) for packaging.
