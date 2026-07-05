#!/usr/bin/env node
// Build the Lunas compiler bindings from the external/lunas submodule with
// wasm-pack, into packages/wasm/generated/{node,web}.
//
// All paths are resolved from import.meta.url at runtime — there are no
// hardcoded absolute paths, and wasm-pack is given a relative --out-dir.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url)); // packages/wasm/scripts
const pkgRoot = path.resolve(here, ".."); // packages/wasm
const repoRoot = path.resolve(pkgRoot, "..", ".."); // repo root
const crate = path.join(repoRoot, "external", "lunas", "crates", "lunas_wasm");

if (!existsSync(path.join(crate, "Cargo.toml"))) {
  console.error(
    "external/lunas submodule not initialized. Run:\n" +
      "  git submodule update --init --recursive",
  );
  process.exit(1);
}

const targets = [
  { target: "nodejs", out: path.join(pkgRoot, "generated", "node") },
  { target: "web", out: path.join(pkgRoot, "generated", "web") },
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

console.log("\n✓ Lunas compiler bindings built.");
