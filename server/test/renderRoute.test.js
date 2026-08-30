import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = (relativePath) => readFile(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

// Route contract regression tests. These intentionally avoid Redis/DB connections.
test("storyboard render rejects projects with no scenes", async () => {
  const routes = await source("../src/routes/render.js");
  assert.match(routes, /if \(!project\.scenes\.length\) return res\.status\(409\)/);
  assert.match(routes, /Generate the storyboard before rendering/);
});

test("storyboard render rejects missing narration before queueing", async () => {
  const routes = await source("../src/routes/render.js");
  assert.match(routes, /narrationFileExists\(project\.id, scene\.id\)/);
  assert.match(routes, /code: "NARRATION_MISSING"/);
  assert.match(routes, /Return to Storyboard and generate narration again/);
});

test("storyboard render reuses an existing active queue job", async () => {
  const routes = await source("../src/routes/render.js");
  assert.match(routes, /const existing = await queue\.getJob\(project\.id\)/);
  assert.match(routes, /\["waiting", "active", "delayed", "prioritized"\]\.includes\(state\)/);
  assert.match(routes, /return res\.status\(202\)\.json\(\{ projectId: project\.id, jobId: existing\.id/);
});

test("completed storyboard renders are reused when the stored output exists", async () => {
  const routes = await source("../src/routes/render.js");
  assert.match(routes, /state === "completed" && project\.renderUrl/);
  assert.match(routes, /status: "completed", progress: 100/);
});

test("editor render requires a saved editor timeline", async () => {
  const routes = await source("../src/routes/editorRender.js");
  assert.match(routes, /if \(!editor\) return res\.status\(409\)/);
  assert.match(routes, /save a timeline before rendering/);
});

test("editor render job identity includes project, version, and timeline hash", async () => {
  const routes = await source("../src/routes/editorRender.js");
  assert.match(routes, /const renderHash = getEditorTimelineHash\(editor\.version, editor\.timeline\)/);
  assert.match(routes, /editor-\$\{req\.params\.id\}-\$\{editor\.version\}-\$\{renderHash\}/);
});

test("editor render only reuses completed output when version and hash still match", async () => {
  const routes = await source("../src/routes/editorRender.js");
  assert.match(routes, /editor\.renderVersion === editor\.version/);
  assert.match(routes, /editor\.renderHash === renderHash/);
  assert.match(routes, /editor\.renderUrl/);
});

test("editor render status reports stale output as non-completed", async () => {
  const routes = await source("../src/routes/editorRender.js");
  assert.match(routes, /editor\.renderStatus === "ready"/);
  assert.match(routes, /editor\.renderVersion === editor\.version/);
  assert.match(routes, /editor\.renderHash === currentHash/);
});
