import test from "node:test";
import assert from "node:assert/strict";
import { readSource } from "../src/services/deepResearchService.js";

const exampleSource = { sourceUrl: "https://example.org/source", title: "Primary research sample", sourceReliability: "primary" };

test("network errors mark the source unreadable and preserve other research", async () => {
  const original = globalThis.fetch;
  const events = [];
  globalThis.fetch = async () => { throw new Error("upstream timed out"); };
  try {
    const result = await readSource(exampleSource, event => events.push(event));
    assert.equal(result.readStatus, "failed");
    assert.equal(result.content, "");
    assert.equal(result.title, exampleSource.title);
    assert.ok(events.some(event => event.type === "source.read_failed" && event.status === "failed"));
  } finally {
    globalThis.fetch = original;
  }
});

test("explicitly stopped research is not silently converted to a failed source", async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  controller.abort(new Error("Stopped by user"));
  const events = [];
  globalThis.fetch = async () => { throw controller.signal.reason; };
  try {
    await assert.rejects(readSource(exampleSource, event => events.push(event), controller.signal), /Stopped by user/);
    assert.ok(events.some(event => event.type === "source.read_failed" && event.status === "cancelled"));
  } finally {
    globalThis.fetch = original;
  }
});
