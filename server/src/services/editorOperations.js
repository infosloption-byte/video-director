const OPERATION_TYPES = new Set([
  "trim_clip",
  "move_clip",
  "split_clip",
  "delete_clip",
  "update_caption",
  "set_volume",
  "add_text_overlay",
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function findClip(timeline, clipId) {
  for (const track of timeline.tracks || []) {
    const index = (track.clips || []).findIndex((clip) => String(clip.id) === String(clipId));
    if (index >= 0) return { track, index, clip: track.clips[index] };
  }
  return null;
}

function recalculateDuration(timeline) {
  const duration = (timeline.tracks || [])
    .flatMap((track) => track.clips || [])
    .reduce((max, clip) => Math.max(max, finite(clip.start) + Math.max(0, finite(clip.duration))), 0);
  return { ...timeline, duration: Number(duration.toFixed(3)) };
}

function replaceClip(timeline, trackId, index, clip) {
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => {
      if (track.id !== trackId) return track;
      const clips = [...(track.clips || [])];
      clips[index] = clip;
      return { ...track, clips };
    }),
  };
}

function applyOperation(inputTimeline, operation) {
  const timeline = clone(inputTimeline);
  const type = String(operation?.type || "");
  if (!OPERATION_TYPES.has(type)) throw new Error(`Unsupported editor operation: ${type || "unknown"}.`);

  if (type === "add_text_overlay") {
    const track = timeline.tracks.find((item) => item.id === "overlays");
    if (!track) throw new Error("Overlay track is unavailable.");
    const start = Math.max(0, finite(operation.start));
    const duration = clamp(finite(operation.duration, 3), 0.05, Math.max(0.05, timeline.duration - start || 3));
    const clip = {
      id: String(operation.id || `ai-overlay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      type: "overlay",
      start,
      duration,
      text: String(operation.text || "").trim().slice(0, 500),
      position: String(operation.position || "center"),
      source: "ai",
    };
    if (!clip.text) throw new Error("Overlay text is required.");
    track.clips.push(clip);
    return recalculateDuration(timeline);
  }

  const found = findClip(timeline, operation.clipId);
  if (!found) throw new Error(`Editor clip not found: ${operation.clipId || "unknown"}.`);
  const { track, index, clip } = found;

  if (type === "delete_clip") {
    if (track.locked) throw new Error("Locked editor tracks cannot be mutated.");
    return recalculateDuration({
      ...timeline,
      tracks: timeline.tracks.map((item) => item.id === track.id ? { ...item, clips: item.clips.filter((_item, itemIndex) => itemIndex !== index) } : item),
    });
  }

  if (type === "trim_clip") {
    const duration = Math.max(0.05, finite(operation.duration, clip.duration));
    const offsetDelta = Math.max(0, finite(operation.offsetDelta));
    const nextOffset = Math.max(0, finite(clip.offset) + offsetDelta);
    if (operation.duration != null && duration <= 0) throw new Error("Clip duration must be positive.");
    return recalculateDuration(replaceClip(timeline, track.id, index, {
      ...clip,
      start: Math.max(0, finite(operation.start, clip.start)),
      duration,
      offset: nextOffset,
    }));
  }

  if (type === "move_clip") {
    return recalculateDuration(replaceClip(timeline, track.id, index, {
      ...clip,
      start: Math.max(0, finite(operation.start, clip.start)),
    }));
  }

  if (type === "update_caption") {
    if (track.kind !== "caption" && clip.type !== "caption") throw new Error("update_caption requires a caption clip.");
    return replaceClip(timeline, track.id, index, { ...clip, text: String(operation.text ?? clip.text ?? "").slice(0, 500) });
  }

  if (type === "set_volume") {
    if (track.kind !== "audio" && clip.type !== "audio") throw new Error("set_volume requires an audio clip.");
    return replaceClip(timeline, track.id, index, { ...clip, volume: clamp(finite(operation.volume, clip.volume ?? 1), 0, 1) });
  }

  if (type === "split_clip") {
    const splitAt = clamp(finite(operation.at, finite(clip.duration) / 2), 0.05, Math.max(0.05, finite(clip.duration) - 0.05));
    if (splitAt >= finite(clip.duration)) throw new Error("Split point must be inside the clip.");
    const first = { ...clip, duration: Number(splitAt.toFixed(3)) };
    const second = {
      ...clip,
      id: String(operation.newClipId || `${clip.id}-split`),
      start: Number((finite(clip.start) + splitAt).toFixed(3)),
      duration: Number((finite(clip.duration) - splitAt).toFixed(3)),
      offset: Number((finite(clip.offset) + splitAt).toFixed(3)),
    };
    return recalculateDuration({
      ...timeline,
      tracks: timeline.tracks.map((item) => item.id === track.id
        ? { ...item, clips: [...item.clips.slice(0, index), first, second, ...item.clips.slice(index + 1)] }
        : item),
    });
  }

  return timeline;
}

export function validateEditorOperations(operations) {
  if (!Array.isArray(operations) || operations.length === 0) throw new Error("At least one editor operation is required.");
  if (operations.length > 25) throw new Error("A single AI edit request may contain at most 25 operations.");
  return operations.map((operation, index) => {
    if (!operation || typeof operation !== "object") throw new Error(`Operation ${index + 1} is invalid.`);
    const type = String(operation.type || "");
    if (!OPERATION_TYPES.has(type)) throw new Error(`Unsupported editor operation: ${type || "unknown"}.`);
    return { ...operation, type };
  });
}

export function previewEditorOperations(timeline, operations) {
  const safeOperations = validateEditorOperations(operations);
  let nextTimeline = clone(timeline);
  const applied = [];
  for (const operation of safeOperations) {
    const before = clone(nextTimeline);
    nextTimeline = applyOperation(nextTimeline, operation);
    applied.push({ operation, changed: JSON.stringify(before) !== JSON.stringify(nextTimeline) });
  }
  return { timeline: nextTimeline, operations: applied };
}

export function applyEditorOperations(timeline, operations) {
  return previewEditorOperations(timeline, operations).timeline;
}

export { OPERATION_TYPES };
