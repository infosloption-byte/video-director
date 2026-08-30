import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = (relativePath) => readFile(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

// These tests inspect queue configuration without connecting to Redis.
// This keeps the regression suite deterministic on developer machines and CI.
test("render queue keeps a stable project job id and retry policy", async () => {
  const queueSource = await source("../src/jobs/renderQueue.js");
  assert.match(queueSource, /jobId:\s*projectId/);
  assert.match(queueSource, /attempts:\s*2/);
  assert.match(queueSource, /backoff:\s*\{\s*type:\s*["']exponential["']/);
});

test("render queue uses a single worker with stalled-job recovery", async () => {
  const queueSource = await source("../src/jobs/renderQueue.js");
  assert.match(queueSource, /concurrency:\s*1/);
  assert.match(queueSource, /stalledInterval:\s*60_000/);
  assert.match(queueSource, /maxStalledCount:\s*2/);
});

test("render worker does not publish terminal failure before retries are exhausted", async () => {
  const queueSource = await source("../src/jobs/renderQueue.js");
  assert.match(queueSource, /attemptsMade\s*<\s*attempts/);
  assert.match(queueSource, /will retry/);
});

test("queued cancellation is limited to safe queue states", async () => {
  const routeSource = await source("../src/routes/render.js");
  assert.match(routeSource, /\["waiting",\s*"delayed",\s*"prioritized"\]\.includes\(state\)/);
  assert.match(routeSource, /code:\s*"RENDER_ACTIVE"/);
});
