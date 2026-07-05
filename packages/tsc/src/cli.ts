#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { loadCompiler, isCompilerAvailable } from "@lunas-tools/wasm";
import { runCheck } from "./run.js";
import { startWatch } from "./watch.js";

const HELP = `lunas-tsc — type-check / diagnose .lunas files

Usage:
  lunas-tsc [paths...]      Check the given files/directories (default: ".")

Options:
  -w, --watch              Re-check on file changes (runs until interrupted)
  -h, --help               Show this help
  -v, --version            Show the version

Exit codes:
  0  no errors
  1  at least one error
  2  usage error / compiler unavailable
`;

function version(): string {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  return pkg.version;
}

function main(argv: string[]): number | null {
  const args = argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.includes("-v") || args.includes("--version")) {
    process.stdout.write(`${version()}\n`);
    return 0;
  }

  const watch = args.includes("-w") || args.includes("--watch");
  const positional = args.filter((a) => !a.startsWith("-"));
  const unknownFlag = args.find(
    (a) => a.startsWith("-") && !["-w", "--watch"].includes(a),
  );
  if (unknownFlag) {
    process.stderr.write(`Unknown option: ${unknownFlag}\n\n${HELP}`);
    return 2;
  }

  const inputs = positional.length > 0 ? positional : ["."];

  if (!isCompilerAvailable()) {
    process.stderr.write(
      "Lunas compiler bindings not built. Run `pnpm wasm:build`.\n",
    );
    return 2;
  }
  const compile = loadCompiler();

  if (watch) {
    process.stdout.write("lunas-tsc: watching for changes (Ctrl-C to stop)…\n");
    const session = startWatch(compile, inputs, (text) =>
      process.stdout.write(text),
    );
    process.on("SIGINT", () => {
      session.close();
      process.exit(0);
    });
    return null; // keep the process alive; exit is driven by SIGINT
  }

  const run = runCheck(compile, inputs);
  if (run.files.length === 0) {
    process.stdout.write("No .lunas files found.\n");
    return 0;
  }
  process.stdout.write(`${run.lines.join("\n")}\n`);
  return run.code;
}

const code = main(process.argv);
if (code !== null) process.exit(code);
