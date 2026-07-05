// Tests for the watch loop, using an injected fake watcher (no real fs events)
// so the debounce/dispatch is deterministic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startWatch } from "../dist/watch.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const noopCompile = () => ({ code: "", diagnostics: [] });

/** A fake watch factory that records the onChange callbacks it's given. */
function fakeFactory() {
  const changes = [];
  const closed = [];
  const factory = (path, onChange) => {
    changes.push(onChange);
    return { close: () => closed.push(path) };
  };
  return { factory, fire: () => changes.forEach((cb) => cb()), changes, closed };
}

test("runs once immediately and watches each input", () => {
  const out = [];
  const fake = fakeFactory();
  const session = startWatch(noopCompile, ["a", "b"], (t) => out.push(t), {
    watchFactory: fake.factory,
    now: () => new Date(0),
  });
  assert.equal(out.length, 1, "initial pass runs immediately");
  assert.equal(fake.changes.length, 2, "one watcher per input");
  session.close();
  assert.deepEqual(fake.closed, ["a", "b"], "close() closes every watcher");
});

test("re-runs (debounced) on a change event", async () => {
  const out = [];
  const fake = fakeFactory();
  const session = startWatch(noopCompile, ["a"], (t) => out.push(t), {
    debounceMs: 10,
    watchFactory: fake.factory,
    now: () => new Date(0),
  });
  assert.equal(out.length, 1);

  // Two quick changes coalesce into a single re-run.
  fake.fire();
  fake.fire();
  await delay(30);
  assert.equal(out.length, 2, "debounced to one extra run");

  session.close();
});

test("runNow forces an immediate re-check", () => {
  const out = [];
  const fake = fakeFactory();
  const session = startWatch(noopCompile, ["a"], (t) => out.push(t), {
    watchFactory: fake.factory,
    now: () => new Date(0),
  });
  session.runNow();
  assert.equal(out.length, 2);
  session.close();
});

test("output is timestamped", () => {
  const out = [];
  const fake = fakeFactory();
  startWatch(noopCompile, ["a"], (t) => out.push(t), {
    watchFactory: fake.factory,
    now: () => new Date(0),
  }).close();
  assert.match(out[0], /^\[.*\] Checked 0 file\(s\)/);
});
