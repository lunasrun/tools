/**
 * The shape of the compiler's output, mirroring the `lunas_wasm` bindings.
 *
 * Offsets in {@link Diagnostic} are **UTF-8 byte offsets** into the original
 * source string (matching the Rust compiler's spans). Use {@link LineIndex} to
 * turn them into line/column positions.
 */

/** Diagnostic severity, as emitted by the compiler. */
export type Severity = "error" | "warning" | "hint";

/** A single diagnostic with a UTF-8 byte range into the source. */
export interface Diagnostic {
  message: string;
  severity: Severity;
  /** Inclusive start, as a UTF-8 byte offset. */
  start: number;
  /** Exclusive end, as a UTF-8 byte offset. */
  end: number;
}

/** The result of compiling one `.lunas` source string. */
export interface CompileResult {
  /** The emitted ES module, or `null` when compilation failed. */
  code: string | null;
  diagnostics: Diagnostic[];
}

/**
 * A synchronous compile function. This is the single boundary every downstream
 * tool depends on; tests inject a fake implementing this signature so they
 * never need the real wasm binary.
 */
export type Compile = (source: string) => CompileResult;
