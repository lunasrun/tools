#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { loadCompiler, isCompilerAvailable } from "@lunas-tools/wasm";
import {
  checkSource,
  formatDiagnostic,
  summarize,
  exitCode,
} from "./check.js";
import { findLunasFiles } from "./find-files.js";

const HELP = `lunas-tsc — type-check / diagnose .lunas files

Usage:
  lunas-tsc [paths...]      Check the given files/directories (default: ".")

Options:
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

function main(argv: string[]): number {
  const args = argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.includes("-v") || args.includes("--version")) {
    process.stdout.write(`${version()}\n`);
    return 0;
  }

  const unknownFlag = args.find((a) => a.startsWith("-"));
  if (unknownFlag) {
    process.stderr.write(`Unknown option: ${unknownFlag}\n\n${HELP}`);
    return 2;
  }

  const inputs = args.length > 0 ? args : ["."];
  const files = findLunasFiles(inputs);

  if (files.length === 0) {
    process.stdout.write("No .lunas files found.\n");
    return 0;
  }

  if (!isCompilerAvailable()) {
    process.stderr.write(
      "Lunas compiler bindings not built. Run `pnpm wasm:build`.\n",
    );
    return 2;
  }

  const compile = loadCompiler();
  const all = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const diagnostics = checkSource(compile, file, source);
    for (const d of diagnostics) process.stdout.write(`${formatDiagnostic(d)}\n`);
    all.push(...diagnostics);
  }

  const summary = summarize(all, files.length);
  process.stdout.write(
    `\nChecked ${summary.files} file(s): ${summary.errors} error(s), ` +
      `${summary.warnings} warning(s), ${summary.hints} hint(s).\n`,
  );
  return exitCode(summary);
}

process.exit(main(process.argv));
