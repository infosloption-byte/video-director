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
      { id: "v1", type: "video", start: 0, duration: 4, offset: 0 },
      { id: "v2", type: "video", start: 4, duration: 4, offset: 0 },
    ] },
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

test("apply operation output is deterministic and does not touch source-media fields", () => {
  const result = applyEditorOperations(timeline, [{ type: "trim_clip", clipId: "v1", duration: 3 }]);
  assert.equal(result.tracks[0].clips[0].duration, 3);
  assert.equal(result.tracks[0].clips[0].src, undefined);
  assert.equal(result.tracks[0].clips[0].offset, 0);
});

test("locked tracks cannot be mutated by delete", () => {
  const locked = { ...timeline, tracks: timeline.tracks.map((track) => track.id === "music" ? { ...track, locked: true } : track) };
  assert.throws(() => applyEditorOperations(locked, [{ type: "delete_clip", clipId: "m1" }]), /Locked editor tracks/);
});
