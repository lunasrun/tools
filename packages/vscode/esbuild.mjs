#!/usr/bin/env node
// Bundle the extension for both the desktop (Node) and web extension hosts.
// `vscode` is provided by the host at runtime, so it is always external.
import { fileURLToPath } from "node:url";
import path from "node:path";
import esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => path.join(here, "src", p);
const out = (p) => path.join(here, "dist", p);

const common = {
  bundle: true,
  external: ["vscode"],
  sourcemap: true,
  minify: process.argv.includes("--minify"),
  logLevel: "info",
};

await Promise.all([
  esbuild.build({
    ...common,
    // `lunas-ls` is spawned as a separate Node process at runtime (its path
    // is resolved via `require.resolve("lunas-ls/node")`), so it must not be
    // inlined into extension.js.
    external: [...common.external, "lunas-ls"],
    entryPoints: [src("extension.ts")],
    outfile: out("extension.js"),
    platform: "node",
    format: "cjs",
    target: "node18",
  }),
  esbuild.build({
    ...common,
    entryPoints: [src("browser.ts")],
    outfile: out("browser.js"),
    platform: "browser",
    format: "cjs",
    target: "es2021",
  }),
]);

console.log("✓ extension bundles built");
