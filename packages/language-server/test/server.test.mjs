// In-process LSP integration test. It stands up the real `createServer` over a
// pair of crossed duplex streams, connects a protocol client to the other ends,
// and exercises the full JSON-RPC round trip: initialize, didOpen (which drives
// a fake compiler and publishes diagnostics), then the structural requests.
//
// Dependency-light: `node --test` plus the vscode-jsonrpc streams that already
// ship with the server's own deps. No wasm binary.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";

import { createConnection } from "vscode-languageserver/node.js";
import {
  createProtocolConnection,
  StreamMessageReader,
  StreamMessageWriter,
  InitializeRequest,
  DidOpenTextDocumentNotification,
  PublishDiagnosticsNotification,
  DocumentSymbolRequest,
  FoldingRangeRequest,
  SelectionRangeRequest,
} from "vscode-languageserver-protocol/node.js";

import { createServer } from "../dist/server.js";

/**
 * Build a linked client/server pair over two PassThrough streams. `clientToServer`
 * carries client requests; `serverToClient` carries server responses/notifications.
 */
function linkedPair(getCompile) {
  const clientToServer = new PassThrough();
  const serverToClient = new PassThrough();

  // Server reads client->server, writes server->client.
  const serverConnection = createConnection(
    new StreamMessageReader(clientToServer),
    new StreamMessageWriter(serverToClient),
  );
  createServer(serverConnection, getCompile);

  // Client reads server->client, writes client->server.
  const client = createProtocolConnection(
    new StreamMessageReader(serverToClient),
    new StreamMessageWriter(clientToServer),
  );
  client.listen();
  return { client, dispose: () => client.end() };
}

/** A fake compiler: flags every occurrence of the word `bad` as an error. */
function fakeCompile(source) {
  const diagnostics = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf("bad", from);
    if (at === -1) break;
    diagnostics.push({ message: "`bad` is not allowed", severity: "error", start: at, end: at + 3 });
    from = at + 3;
  }
  return { code: diagnostics.length ? null : "", diagnostics };
}

const OPEN_URI = "file:///test.lunas";
const OPEN_TEXT = "script:\n  let x = 1\nhtml:\n  <p>{ bad }</p>\nstyle:\n  p {}";

async function initialize(client) {
  return client.sendRequest(InitializeRequest.type, {
    processId: null,
    rootUri: null,
    capabilities: {},
  });
}

/** Open the document and resolve with the first publishDiagnostics for it. */
function openAndAwaitDiagnostics(client, uri, text) {
  return new Promise((resolve) => {
    client.onNotification(PublishDiagnosticsNotification.type, (params) => {
      if (params.uri === uri) resolve(params);
    });
    client.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: { uri, languageId: "lunas", version: 1, text },
    });
  });
}

test("initialize advertises diagnostics + structural capabilities", async () => {
  const { client, dispose } = linkedPair(() => fakeCompile);
  try {
    const result = await initialize(client);
    const caps = result.capabilities;
    assert.ok(caps.textDocumentSync != null);
    assert.equal(caps.documentSymbolProvider, true);
    assert.equal(caps.foldingRangeProvider, true);
    assert.equal(caps.selectionRangeProvider, true);
  } finally {
    dispose();
  }
});

test("didOpen publishes diagnostics with mapped ranges", async () => {
  const { client, dispose } = linkedPair(() => fakeCompile);
  try {
    await initialize(client);
    const params = await openAndAwaitDiagnostics(client, OPEN_URI, OPEN_TEXT);
    assert.equal(params.uri, OPEN_URI);
    assert.equal(params.diagnostics.length, 1);
    const [diag] = params.diagnostics;
    assert.equal(diag.severity, 1); // Error
    assert.equal(diag.source, "lunas");
    // `bad` sits on line 3 (0-based) at column 7: "  <p>{ bad }".
    assert.deepEqual(diag.range, {
      start: { line: 3, character: 7 },
      end: { line: 3, character: 10 },
    });
  } finally {
    dispose();
  }
});

test("no diagnostics are published when the compiler is unavailable", async () => {
  // getCompile returns null -> server stays up, publishes nothing on open.
  const { client, dispose } = linkedPair(() => null);
  try {
    await initialize(client);
    let received = false;
    client.onNotification(PublishDiagnosticsNotification.type, () => {
      received = true;
    });
    client.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: { uri: OPEN_URI, languageId: "lunas", version: 1, text: OPEN_TEXT },
    });
    // Give the server a tick to (not) respond.
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(received, false);
  } finally {
    dispose();
  }
});

test("documentSymbol returns the block outline", async () => {
  const { client, dispose } = linkedPair(() => fakeCompile);
  try {
    await initialize(client);
    await openAndAwaitDiagnostics(client, OPEN_URI, OPEN_TEXT);
    const symbols = await client.sendRequest(DocumentSymbolRequest.type, {
      textDocument: { uri: OPEN_URI },
    });
    assert.deepEqual(
      symbols.map((s) => s.name),
      ["script", "html", "style"],
    );
    const html = symbols.find((s) => s.name === "html");
    assert.equal(html.children.length, 1);
  } finally {
    dispose();
  }
});

test("foldingRange folds each multi-line block", async () => {
  const { client, dispose } = linkedPair(() => fakeCompile);
  try {
    await initialize(client);
    await openAndAwaitDiagnostics(client, OPEN_URI, OPEN_TEXT);
    const folds = await client.sendRequest(FoldingRangeRequest.type, {
      textDocument: { uri: OPEN_URI },
    });
    assert.equal(folds.length, 3);
    assert.equal(folds[0].startLine, 0);
  } finally {
    dispose();
  }
});

test("selectionRange expands around a position", async () => {
  const { client, dispose } = linkedPair(() => fakeCompile);
  try {
    await initialize(client);
    await openAndAwaitDiagnostics(client, OPEN_URI, OPEN_TEXT);
    const ranges = await client.sendRequest(SelectionRangeRequest.type, {
      textDocument: { uri: OPEN_URI },
      positions: [{ line: 3, character: 8 }], // inside `{ bad }`
    });
    assert.equal(ranges.length, 1);
    // Has at least one widening parent.
    assert.ok(ranges[0].parent);
  } finally {
    dispose();
  }
});

test("requests for an unopened document return null", async () => {
  const { client, dispose } = linkedPair(() => fakeCompile);
  try {
    await initialize(client);
    const symbols = await client.sendRequest(DocumentSymbolRequest.type, {
      textDocument: { uri: "file:///never-opened.lunas" },
    });
    assert.equal(symbols, null);
  } finally {
    dispose();
  }
});
