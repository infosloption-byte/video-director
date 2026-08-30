import { Router } from "express";
import { prisma } from "../db/client.js";

const router = Router();
const ALLOWED_TRANSITIONS = new Set(["none", "fade", "slide-left", "slide-right", "zoom"]);
const ALLOWED_EFFECTS = new Set(["none", "slow-zoom-in", "slow-zoom-out", "pan-left", "pan-right"]);

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeTransition(value, clipDuration) {
  const preset = ALLOWED_TRANSITIONS.has(String(value?.preset)) ? String(value.preset) : "none";
  const maxDuration = Math.min(1.5, Math.max(0.05, clipDuration / 2));
  return {
    preset,
    duration: clamp(toNumber(value?.duration, 0.35), 0.05, maxDuration),
  };
}

function normalizeEffect(value) {
  const preset = ALLOWED_EFFECTS.has(String(value?.preset)) ? String(value.preset) : "none";
  return {
    preset,
    intensity: clamp(toNumber(value?.intensity, 0.5), 0, 1),
  };
}

function sanitizeClip(clip, index, trackKind, trackId) {
  const duration = Math.max(0.05, toNumber(clip.duration, 1));
  const safeClip = {
    ...clip,
    id: String(clip.id || `${trackId}-clip-${index}`),
    start: Math.max(0, toNumber(clip.start)),
    duration,
    offset: Math.max(0, toNumber(clip.offset)),
  };

  if (trackKind === "video" || safeClip.type === "video") {
    safeClip.transitionIn = normalizeTransition(clip.transitionIn, duration);
    safeClip.transitionOut = normalizeTransition(clip.transitionOut, duration);
    safeClip.effect = normalizeEffect(clip.effect);
  }

  if (trackKind === "audio" || safeClip.type === "audio") {
    safeClip.volume = clamp(toNumber(clip.volume, 1), 0, 1);
    safeClip.fadeIn = clamp(toNumber(clip.fadeIn), 0, Math.min(2, duration / 2));
    safeClip.fadeOut = clamp(toNumber(clip.fadeOut), 0, Math.min(2, duration / 2));
  }

  return safeClip;
}

function buildInitialTimeline(scenes) {
  let cursor = 0;
  const video = [];
  const narration = [];
  const captions = [];

  for (const scene of scenes) {
    const duration = Math.max(0.1, toNumber(scene.durationSeconds, 1));
    const selected = scene.assets.find((asset) => asset.isSelected) || scene.assets[0] || null;
    video.push({
      id: `video-${scene.id}`,
      type: "video",
      sourceId: scene.id,
      assetId: selected?.id || null,
      src: selected?.videoUrl || null,
      thumbnailUrl: selected?.thumbnailUrl || null,
      start: cursor,
      duration,
      offset: 0,
      title: scene.title || `Scene ${scene.sceneOrder}`,
      transitionIn: { preset: "none", duration: 0.35 },
      transitionOut: { preset: "none", duration: 0.35 },
      effect: { preset: "none", intensity: 0.5 },
    });
    if (scene.audioUrl) {
      narration.push({
        id: `audio-${scene.id}`,
        type: "audio",
        sourceId: scene.id,
        src: scene.audioUrl,
        start: cursor,
        duration,
        volume: 1,
        fadeIn: 0,
        fadeOut: 0,
      });
    }
    captions.push({
      id: `caption-${scene.id}`,
      type: "caption",
      sourceId: scene.id,
      start: cursor,
      duration,
      text: scene.spokenText,
      style: "default",
      position: "lower-middle",
    });
    cursor += duration;
  }

  return {
    schemaVersion: 1,
    fps: 30,
    width: 1080,
    height: 1920,
    duration: Number(cursor.toFixed(3)),
    tracks: [
      { id: "video", kind: "video", name: "B-roll", locked: false, muted: false, clips: video },
      { id: "narration", kind: "audio", name: "Narration", locked: true, muted: false, clips: narration },
      { id: "captions", kind: "caption", name: "Captions", locked: false, muted: true, clips: captions },
      { id: "overlays", kind: "overlay", name: "Overlays", locked: false, muted: false, clips: [] },
      { id: "music", kind: "audio", name: "Music", locked: false, muted: false, clips: [] },
    ],
  };
}

function sanitizeTimeline(input, fallback) {
  if (!input || typeof input !== "object") return fallback;
  const tracks = Array.isArray(input.tracks) ? input.tracks : fallback.tracks;
  const safeTracks = tracks.map((track, trackIndex) => {
    const trackId = String(track.id || fallback.tracks[trackIndex]?.id || `track-${trackIndex}`);
    const kind = String(track.kind || fallback.tracks[trackIndex]?.kind || "video");
    return {
      id: trackId,
      kind,
      name: String(track.name || fallback.tracks[trackIndex]?.name || "Track"),
      locked: Boolean(track.locked),
      muted: Boolean(track.muted),
      clips: Array.isArray(track.clips) ? track.clips.map((clip, index) => sanitizeClip(clip, index, kind, trackId)) : [],
    };
  });
  const calculatedDuration = safeTracks.flatMap((track) => track.clips).reduce((max, clip) => Math.max(max, clip.start + clip.duration), 0);
  return {
    ...fallback,
    schemaVersion: 1,
    fps: Math.max(1, Math.round(toNumber(input.fps, 30))),
    width: 1080,
    height: 1920,
    duration: Number(calculatedDuration.toFixed(3)),
    tracks: safeTracks,
  };
}

router.get("/:id/editor", async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { editor: true, scenes: { orderBy: { sceneOrder: "asc" }, include: { assets: { orderBy: { sortOrder: "asc" } } } } },
    });
    if (!project) return res.status(404).json({ error: "Project not found." });

    const initialTimeline = buildInitialTimeline(project.scenes);
    let editor = project.editor;
    if (!editor) {
      editor = await prisma.projectEditor.create({ data: { projectId: project.id, version: 1, timeline: initialTimeline } });
    }

    res.json({
      editor: { id: editor.id, projectId: editor.projectId, version: editor.version, timeline: editor.timeline, updatedAt: editor.updatedAt },
      project: { id: project.id, title: project.title, durationSeconds: project.durationSeconds == null ? null : Number(project.durationSeconds), cuts: project.cuts || project.scenes.length },
      scenes: project.scenes.map((scene) => ({
        id: scene.id,
        sceneOrder: scene.sceneOrder,
        title: scene.title,
        spokenText: scene.spokenText,
        durationSeconds: scene.durationSeconds == null ? null : Number(scene.durationSeconds),
        audioUrl: scene.audioUrl,
        wordTimestamps: scene.wordTimestamps || [],
        assets: scene.assets,
      })),
    });
  } catch (error) {
    console.error(`GET /api/projects/${req.params.id}/editor failed:`, error);
    res.status(500).json({ error: "Failed to load editor." });
  }
});

// Editor mutations intentionally persist only ProjectEditor.timeline; Storyboard scenes/assets remain read-only here.
router.patch("/:id/editor", async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id }, select: { id: true, scenes: { orderBy: { sceneOrder: "asc" }, include: { assets: { orderBy: { sortOrder: "asc" } } } } } });
    if (!project) return res.status(404).json({ error: "Project not found." });

    const current = await prisma.projectEditor.findUnique({ where: { projectId: project.id } });
    const fallback = current?.timeline || buildInitialTimeline(project.scenes);
    const expectedVersion = req.body?.version == null ? null : Number(req.body.version);
    if (current && expectedVersion != null && expectedVersion !== current.version) {
      return res.status(409).json({ error: "Editor changed elsewhere. Reload before saving.", version: current.version, timeline: current.timeline });
    }

    const timeline = sanitizeTimeline(req.body?.timeline, fallback);
    const editor = current
      ? await prisma.projectEditor.update({ where: { projectId: project.id }, data: { version: { increment: 1 }, timeline } })
      : await prisma.projectEditor.create({ data: { projectId: project.id, version: 1, timeline } });

    res.json({ editor: { id: editor.id, projectId: editor.projectId, version: editor.version, timeline: editor.timeline, updatedAt: editor.updatedAt } });
  } catch (error) {
    console.error(`PATCH /api/projects/${req.params.id}/editor failed:`, error);
    res.status(500).json({ error: "Failed to save editor changes." });
  }
});

export default router;
