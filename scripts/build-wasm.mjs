#!/usr/bin/env node
// Build the Lunas compiler bindings from the `external/lunas` submodule with
// wasm-pack, into `wasm/{node,web}` at the repo root.
//
//   - `wasm/node` (wasm-pack `--target nodejs`) is what `vite-plugin-lunas`
//     loads at build time to compile `.lunas` components (see vite.config.ts,
//     which points the plugin at it via `wasmPkgPath`).
//   - `wasm/web`  (wasm-pack `--target web`) is loaded in the browser by the
//     playground to compile `.lunas` sources live.
//
// All paths are resolved from `import.meta.url` at runtime — no absolute paths,
// and wasm-pack is given a relative `--out-dir`. The bindings are rebuilt from
// the submodule, so `wasm/` is git-ignored.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url)); // scripts/
const repoRoot = path.resolve(here, ".."); // repo root
const crate = path.join(repoRoot, "external", "lunas", "crates", "lunas_wasm");

if (!existsSync(path.join(crate, "Cargo.toml"))) {
  console.error(
    "external/lunas submodule not initialized. Run:\n" +
      "  git submodule update --init --recursive",
  );
  process.exit(1);
}

const targets = [
  { target: "nodejs", out: path.join(repoRoot, "wasm", "node") },
  { target: "web", out: path.join(repoRoot, "wasm", "web") },
];

for (const { target, out } of targets) {
  // wasm-pack interprets --out-dir relative to the crate directory.
  const outRel = path.relative(crate, out);
  console.log(`\n▶ wasm-pack build (${target}) -> ${path.relative(repoRoot, out)}`);
  execFileSync(
    "wasm-pack",
    [
      "build",
      crate,
      "--target",
      target,
      "--out-dir",
      outRel,
      "--out-name",
      "lunas_wasm",
      "--release",
    ],
    { stdio: "inherit" },
  );
}

console.log("\n✓ Lunas compiler bindings built into wasm/{node,web}.");
