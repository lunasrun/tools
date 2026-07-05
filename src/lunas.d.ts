// Ambient module declarations for consuming Lunas from the submodule.

// Compiled Lunas single-file components. `vite-plugin-lunas` turns each
// `*.lunas` module into an ES module whose default export is a component
// factory: call it (optionally with props) to build a detached root `Element`,
// then `attach` it to the DOM (see src/main.ts).
declare module "*.lunas" {
  import type { ComponentFactory } from "lunas";
  const component: ComponentFactory;
  export default component;
}

// The Vite plugin ships as plain ESM with no bundled types.
declare module "vite-plugin-lunas" {
  import type { Plugin } from "vite";
  interface LunasPluginOptions {
    extensions?: string[];
    compiler?: { compile(source: string): { code: string | null; diagnostics?: unknown[] } };
    wasmPkgPath?: string;
  }
  export default function lunas(options?: LunasPluginOptions): Plugin;
}
