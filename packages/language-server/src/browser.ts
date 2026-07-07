import {
  createConnection,
  BrowserMessageReader,
  BrowserMessageWriter,
} from "vscode-languageserver/browser";
import type { Compile } from "@lunas-tools/wasm";
import { createServer } from "./server.js";

// Browser entry: LSP over a dedicated web worker's message channel.
// `self` is the worker global; typed loosely to avoid pulling in the WebWorker
// lib just for this reference.
declare const self: {
  postMessage(message: unknown): void;
  addEventListener(type: string, listener: (event: unknown) => void): void;
};

const messageReader = new BrowserMessageReader(self as never);
const messageWriter = new BrowserMessageWriter(self as never);
const connection = createConnection(messageReader, messageWriter);

// Wiring the web-target wasm compiler into the worker is future work
// (roadmap: ls-browser-entry -> compiler). The worker boots and serves
// capabilities today; diagnostics arrive once the compiler is supplied.
const compile: Compile | null = null;

createServer(connection, () => compile);
