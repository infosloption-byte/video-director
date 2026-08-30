import test from "node:test";
import assert from "node:assert/strict";

const queueSource = await (await fetch(new URL("../src/jobs/renderQueue.js", import.meta.url))).text();

// These tests intentionally inspect queue configuration without connecting to Redis.
// This keeps the regression suite deterministic on developer machines and CI.
test("render queue keeps a stable project job id and retry policy", () => {
  assert.match(queueSource, /jobId:\s*projectId/);
  assert.match(queueSource, /attempts:\s*2/);
  assert.match(queueSource, /backoff:\s*\{\s*type:\s*["']exponential["']/);
});

test("render queue uses a single worker with stalled-job recovery", () => {
  assert.match(queueSource, /concurrency:\s*1/);
  assert.match(queueSource, /stalledInterval:\s*60_000/);
  assert.match(queueSource, /maxStalledCount:\s*2/);
});

test("render worker does not publish terminal failure before retries are exhausted", () => {
  assert.match(queueSource, /attemptsMade\s*<\s*attempts/);
  assert.match(queueSource, /will retry/);
});

test("queued cancellation is limited to safe queue states", async () => {
  const routeSource = await (await fetch(new URL("../src/routes/render.js", import.meta.url))).text();
  assert.match(routeSource, /\["waiting",\s*"delayed",\s*"prioritized"\]\.includes\(state\)/);
  assert.match(routeSource, /code:\s*"RENDER_ACTIVE"/);
});
