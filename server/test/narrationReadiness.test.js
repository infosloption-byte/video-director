import test from "node:test";
import assert from "node:assert/strict";
import { inspectNarration } from "../src/services/narrationReadiness.js";

const scene = (id, order, audioUrl, wordTimestamps = []) => ({
  id, sceneOrder: order, audioUrl, wordTimestamps,
});

test("playable audio with empty word timestamps is ready for rendering", async () => {
  const result = await inspectNarration("project-1", [
    scene("s1", 1, "/api/audio/project-1/scenes/s1.mp3"),
  ], async () => true);
  assert.equal(result.ready, true);
  assert.equal(result.readyScenes, 1);
  assert.equal(result.scenes[0].hasWordTimestamps, false);
  assert.deepEqual(result.missingScenes, []);
});

test("scene with audio metadata but deleted file is not render-ready", async () => {
  const result = await inspectNarration("p", [
    scene("s1", 1, "/api/audio/p/scenes/s1.mp3", [{ word: "test" }]),
    scene("s2", 2, "/api/audio/p/scenes/s2.mp3", []),
  ], async (_projectId, sceneId) => sceneId !== "s2");
  assert.equal(result.ready, false);
  assert.equal(result.readyScenes, 1);
  assert.deepEqual(result.missingScenes, [2]);
  assert.equal(result.scenes[1].reason, "audio_file_missing");
});

test("missing audio URL does not probe file storage", async () => {
  let calls = 0;
  const result = await inspectNarration("p", [scene("s1", 1, null)], async () => {
    calls += 1;
    return true;
  });
  assert.equal(calls, 0);
  assert.equal(result.ready, false);
  assert.equal(result.scenes[0].reason, "audio_not_generated");
});

test("empty storyboard must not report narration ready", async () => {
  const result = await inspectNarration("p", [], async () => true);
  assert.equal(result.ready, false);
  assert.equal(result.totalScenes, 0);
});

test("readiness is scoped to project and scene file checks", async () => {
  const calls = [];
  const result = await inspectNarration("p", [
    scene("s1", 1, "/api/audio/p/scenes/s1.mp3"),
    scene("s2", 2, "/api/audio/p/scenes/s2.mp3"),
  ], async (...args) => { calls.push(args); return true; });
  assert.equal(result.ready, true);
  assert.deepEqual(calls, [["p", "s1"], ["p", "s2"]]);
});
