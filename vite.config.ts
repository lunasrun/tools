import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import lunas from "vite-plugin-lunas";

// The plugin compiles `.lunas` components at build time via the wasm-pack
// `nodejs` bindings built by `pnpm wasm:build` into `wasm/node` (see
// scripts/build-wasm.mjs). Resolved from this file's URL — no absolute paths.
const wasmPkgPath = fileURLToPath(new URL("./wasm/node", import.meta.url));

export default defineConfig({
  plugins: [lunas({ wasmPkgPath })],
});
