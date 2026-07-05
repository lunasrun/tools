import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  Analyze,
  AnalyzeResult,
  Compile,
  CompileResult,
} from "./types.js";

/**
 * Location of the wasm-pack `nodejs` bindings, relative to the built package.
 * `dist/loader.js` and `generated/` are siblings under the package root, so the
 * path is resolved from `import.meta.url` — never hardcoded absolutely.
 */
const NODE_BINDINGS = new URL(
  "../generated/node/lunas_wasm.js",
  import.meta.url,
);

/**
 * Whether the real compiler bindings have been built (`pnpm wasm:build`).
 * Downstream tests use this to skip the integration path gracefully.
 */
export function isCompilerAvailable(): boolean {
  return existsSync(fileURLToPath(NODE_BINDINGS));
}

/**
 * Load the real Lunas compiler (Node target).
 *
 * The wasm-pack `nodejs` output is CommonJS, so it is loaded with `require`.
 * Throws a clear, actionable error when the bindings have not been built yet —
 * this is the single place that knows how the compiler is supplied, so
 * switching to a published npm package later changes only this function.
 */
/** The subset of the wasm-pack `nodejs` module this package consumes. */
interface Bindings {
  compile(source: string): CompileResult;
  analyze(source: string): AnalyzeResult;
}

function requireBindings(): Bindings {
  if (!isCompilerAvailable()) {
    throw new Error(
      "Lunas compiler bindings not found. Run `pnpm wasm:build` to build them " +
        "from the external/lunas submodule.",
    );
  }
  const require = createRequire(import.meta.url);
  return require(fileURLToPath(NODE_BINDINGS)) as Bindings;
}

export function loadCompiler(): Compile {
  const bindings = requireBindings();
  return (source: string) => bindings.compile(source);
}

/**
 * Load the real Lunas analyzer (Node target) — the navigation counterpart to
 * {@link loadCompiler}, backed by the same bindings. Throws the same actionable
 * error when the bindings have not been built.
 */
export function loadAnalyzer(): Analyze {
  const bindings = requireBindings();
  return (source: string) => bindings.analyze(source);
}
