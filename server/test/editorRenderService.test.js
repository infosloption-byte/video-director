import test from "node:test";
import assert from "node:assert/strict";
import { collectMediaIds, getEditorTimelineHash, timelineHasAudio, validateTimeline } from "../src/services/editorRenderService.js";

const validTimeline = { fps: 30, width: 1080, height: 1920, duration: 12, tracks: [{ id: "video", kind: "video", clips: [{ mediaId: "media-1", start: 0, duration: 6 }] }, { id: "music", kind: "audio", clips: [{ mediaId: "music-1", start: 0, duration: 12 }] }] };

test("validateTimeline accepts the canonical editor format", () => {
  assert.equal(validateTimeline(validTimeline), 12);
});

test("validateTimeline rejects unsupported dimensions and fps", () => {
  assert.throws(() => validateTimeline({ ...validTimeline, fps: 60 }), /30fps/);
  assert.throws(() => validateTimeline({ ...validTimeline, width: 1920 }), /1080x1920/);
  assert.throws(() => validateTimeline({ ...validTimeline, tracks: [] , duration: 0 }), /duration/);
});

test("timeline hash changes when version or timeline changes", () => {
  const hash = getEditorTimelineHash(3, validTimeline);
  assert.equal(hash, getEditorTimelineHash(3, validTimeline));
  assert.notEqual(hash, getEditorTimelineHash(4, validTimeline));
  assert.notEqual(hash, getEditorTimelineHash(3, { ...validTimeline, duration: 13 }));
});

test("collectMediaIds returns unique referenced media IDs", () => {
  const ids = collectMediaIds({ tracks: [{ clips: [{ mediaId: "a" }, { mediaId: "a" }, { mediaId: "b" }] }] });
  assert.deepEqual(ids, ["a", "b"]);
});

test("timelineHasAudio ignores muted tracks and clips without a source", () => {
  assert.equal(timelineHasAudio({ tracks: [{ kind: "audio", muted: true, clips: [{ mediaId: "a" }] }] }), false);
  assert.equal(timelineHasAudio({ tracks: [{ kind: "audio", clips: [{ start: 0, duration: 2 }] }] }), false);
  assert.equal(timelineHasAudio({ tracks: [{ kind: "audio", clips: [{ mediaId: "a" }] }] }), true);
});
