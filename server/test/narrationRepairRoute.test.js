import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const storyboard = () => readFile(new URL("../src/routes/storyboard.js", import.meta.url), "utf8");
const render = () => readFile(new URL("../src/routes/render.js", import.meta.url), "utf8");

test("narration status checks render-ready audio files, not required word timestamps", async () => {
  const src = await storyboard();
  assert.match(src, /inspectNarration\(project\.id, project\.scenes, narrationFileExists\)/);
  assert.doesNotMatch(src.slice(src.lastIndexOf('router.get("/projects/:id/narration-status"')),
    /wordTimestamps\.length > 0/);
});

test("repair endpoint only synthesizes scenes whose audio is missing", async () => {
  const src = await storyboard();
  const block = src.slice(src.indexOf('router.post("/projects/:id/repair-narration"'),
                          src.indexOf('router.get("/projects/:id/narration-status"'));
  assert.match(block, /missingIds\.has\(scene\.id\)/);
  assert.match(block, /if \(!missingIds\.has\(scene\.id\)\) continue/);
  assert.match(block, /resolveNarrationVoice/);
  assert.match(block, /activeRepairs/);
});

test("render server still blocks projects with physically missing audio files", async () => {
  const src = await render();
  assert.match(src, /narrationFileExists\(project\.id, scene\.id\)/);
  assert.match(src, /code: "NARRATION_MISSING"/);
});
