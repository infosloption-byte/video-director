import test from "node:test";
import assert from "node:assert/strict";
import { applyEditorOperations, previewEditorOperations, validateEditorOperations } from "../src/services/editorOperations.js";

const timeline = {
  schemaVersion: 1,
  fps: 30,
  width: 1080,
  height: 1920,
  duration: 8,
  tracks: [
    { id: "video", kind: "video", locked: false, muted: false, clips: [
      { id: "v1", type: "video", sourceId: "scene-1", assetId: "asset-1", src: "/video-1.mp4", thumbnailUrl: "/thumb-1.jpg", start: 0, duration: 4, offset: 0 },
      { id: "v2", type: "video", sourceId: "scene-2", assetId: "asset-2", src: "/video-2.mp4", thumbnailUrl: "/thumb-2.jpg", start: 4, duration: 4, offset: 0 },
    ] },
    { id: "narration", kind: "audio", locked: true, muted: false, clips: [{ id: "n1", type: "audio", sourceId: "scene-1", src: "/audio-1.mp3", start: 0, duration: 4, volume: 1 }] },
    { id: "captions", kind: "caption", locked: false, muted: true, clips: [{ id: "c1", type: "caption", start: 0, duration: 4, text: "old" }] },
    { id: "music", kind: "audio", locked: false, muted: false, clips: [{ id: "m1", type: "audio", start: 0, duration: 8, volume: 1 }] },
    { id: "overlays", kind: "overlay", locked: false, muted: false, clips: [] },
  ],
};

test("validates bounded structured editor operations", () => {
  assert.equal(validateEditorOperations([{ type: "trim_clip", clipId: "v1", duration: 2 }]).length, 1);
  assert.throws(() => validateEditorOperations([{ type: "delete_source_media", clipId: "v1" }]), /Unsupported editor operation/);
  assert.throws(() => validateEditorOperations(Array.from({ length: 26 }, () => ({ type: "move_clip", clipId: "v1", start: 0 }))), /at most 25/);
});

test("preview applies trim, move, split, caption, volume and overlay operations without mutating input", () => {
  const operations = [
    { type: "trim_clip", clipId: "v1", duration: 2 },
    { type: "move_clip", clipId: "v2", start: 2 },
    { type: "split_clip", clipId: "v2", at: 1, newClipId: "v2b" },
    { type: "update_caption", clipId: "c1", text: "new caption" },
    { type: "set_volume", clipId: "m1", volume: 0.4 },
    { type: "add_text_overlay", id: "ai-overlay-1", text: "Hook", start: 1, duration: 2 },
  ];
  const original = JSON.stringify(timeline);
  const result = previewEditorOperations(timeline, operations);
  assert.equal(JSON.stringify(timeline), original);
  assert.equal(result.timeline.tracks.find((track) => track.id === "captions").clips[0].text, "new caption");
  assert.equal(result.timeline.tracks.find((track) => track.id === "music").clips[0].volume, 0.4);
  assert.equal(result.timeline.tracks.find((track) => track.id === "video").clips.length, 3);
  assert.equal(result.timeline.tracks.find((track) => track.id === "overlays").clips.length, 1);
});

test("AI can suggest a project-owned B-roll replacement without mutating source fields", () => {
  const original = JSON.stringify(timeline);
  const result = previewEditorOperations(timeline, [{ type: "replace_broll", clipId: "v1", sourceId: "scene-1", assetId: "asset-3", src: "/video-3.mp4", thumbnailUrl: "/thumb-3.jpg" }]);
  const clip = result.timeline.tracks.find((track) => track.id === "video").clips[0];
  assert.equal(JSON.stringify(timeline), original);
  assert.equal(clip.assetId, "asset-3");
  assert.equal(clip.src, "/video-3.mp4");
  assert.equal(clip.sourceId, "scene-1");
});

test("AI narration regeneration remains an editor suggestion and preserves the locked audio source", () => {
  const original = JSON.stringify(timeline);
  const result = applyEditorOperations(timeline, [{ type: "regenerate_narration", clipId: "n1", text: "A clearer replacement narration." }]);
  const clip = result.timeline.tracks.find((track) => track.id === "narration").clips[0];
  assert.equal(JSON.stringify(timeline), original);
  assert.equal(clip.src, "/audio-1.mp3");
  assert.equal(clip.suggestedText, "A clearer replacement narration.");
  assert.equal(clip.narrationStatus, "regeneration-suggested");
});

test("apply operation output is deterministic and does not touch source-media fields", () => {
  const result = applyEditorOperations(timeline, [{ type: "trim_clip", clipId: "v1", duration: 3 }]);
  assert.equal(result.tracks[0].clips[0].duration, 3);
  assert.equal(result.tracks[0].clips[0].src, "/video-1.mp4");
  assert.equal(result.tracks[0].clips[0].offset, 0);
});

test("locked tracks cannot be mutated by delete", () => {
  const locked = { ...timeline, tracks: timeline.tracks.map((track) => track.id === "music" ? { ...track, locked: true } : track) };
  assert.throws(() => applyEditorOperations(locked, [{ type: "delete_clip", clipId: "m1" }]), /Locked editor tracks/);
});
