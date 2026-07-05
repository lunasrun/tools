/**
 * `lunas-ls` — the Lunas language server core.
 *
 * The transport-specific entry points live in `./node` and `./browser`; this
 * module exports the shared, transport-agnostic pieces so they can be embedded
 * or tested directly.
 */
export { createServer } from "./server.js";
export type { CompileProvider } from "./server.js";
export {
  toLspDiagnostics,
  toLspSeverity,
  DIAGNOSTIC_SOURCE,
} from "./diagnostics.js";
