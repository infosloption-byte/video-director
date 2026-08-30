import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { editorCompositionMetadata } from "../src/remotion/EditorComposition.jsx";
import { getEditorTimelineHash, validateTimeline } from "../src/services/editorRenderService.js";

const source = (relativePath) => readFile(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

const fixture = {
  fps: 30,
  width: 1080,
  height: 1920,
  duration: 10,
  tracks: [
    { id: "video", kind: "video", clips: [
      { id: "a", mediaId: "media-a", start: 0, duration: 3, offset: 1 },
      { id: "b", mediaId: "media-b", start: 3, duration: 4, offset: 0.5 },
      { id: "c", mediaId: "media-a", start: 7, duration: 3, offset: 2 },
    ] },
    { id: "narration", kind: "audio", clips: [{ id: "n", mediaId: "voice-1", start: 0, duration: 10, volume: 1 }] },
    { id: "captions", kind: "caption", clips: [{ id: "cap", start: 3, duration: 2, text: "hello" }] },
  ],
};

test("browser-style trim/split/reorder fixture remains renderable", () => {
  assert.equal(validateTimeline(fixture), 10);
  const reordered = { ...fixture, tracks: fixture.tracks.map((track) => track.id === "video" ? { ...track, clips: [...track.clips].reverse() } : track) };
  const split = { ...fixture, tracks: fixture.tracks.map((track) => track.id === "video" ? { ...track, clips: [...track.clips, { id: "b2", mediaId: "media-b", start: 5, duration: 2, offset: 2.5 }] } : track) };
  const trimmed = { ...fixture, duration: 9, tracks: fixture.tracks.map((track) => track.id === "video" ? { ...track, clips: track.clips.map((clip) => clip.id === "c" ? { ...clip, start: 6, duration: 3 } : clip) } : track) };
  assert.doesNotThrow(() => validateTimeline(reordered));
  assert.doesNotThrow(() => validateTimeline(split));
  assert.doesNotThrow(() => validateTimeline(trimmed));
  assert.notEqual(getEditorTimelineHash(1, fixture), getEditorTimelineHash(1, reordered));
  assert.notEqual(getEditorTimelineHash(1, fixture), getEditorTimelineHash(1, split));
  assert.notEqual(getEditorTimelineHash(1, fixture), getEditorTimelineHash(1, trimmed));
});

test("Remotion editor composition derives exact frame duration from timeline", () => {
  const meta = editorCompositionMetadata({ props: { timeline: fixture } });
  assert.equal(meta.fps, 30);
  assert.equal(meta.durationInFrames, 300);
  assert.equal(meta.width, 1080);
  assert.equal(meta.height, 1920);
});

test("Remotion editor composition preserves trim offset and track start semantics", async () => {
  const composition = await source("../src/remotion/EditorComposition.jsx");
  assert.match(composition, /startFrom = Math\.max\(0, Math\.round\(Number\(clip\.offset/);
  assert.match(composition, /from=\{Math\.max\(0, Math\.round\(Number\(clip\.start/);
  assert.match(composition, /durationInFrames=\{clipFrames\(clip, fps\)\}/);
});

test("caption and audio clips use the same canonical start/duration frame mapping", async () => {
  const composition = await source("../src/remotion/EditorComposition.jsx");
  const occurrences = (text, pattern) => text.match(pattern)?.length || 0;
  assert.ok(occurrences(composition, /Math\.round\(Number\(clip\.start \|\| 0\) \* fps\)/g) >= 3);
  assert.match(composition, /audioTracks\.flatMap/);
  assert.match(composition, /captionTracks\.flatMap/);
});

test("render media resolver uses authenticated project media URLs and prefers proxies", async () => {
  const service = await source("../src/services/editorRenderService.js");
  assert.match(service, /proxyStorageKey/);
  assert.match(service, /\/api\/render-media\//);
  assert.match(service, /RENDER_ASSET_TOKEN/);
  assert.match(service, /renderToken=/);
});
