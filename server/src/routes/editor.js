import { Router } from "express";
import { prisma } from "../db/client.js";

const router = Router();

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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
    ],
  };
}

function sanitizeTimeline(input, fallback) {
  if (!input || typeof input !== "object") return fallback;
  const tracks = Array.isArray(input.tracks) ? input.tracks : fallback.tracks;
  const safeTracks = tracks.map((track, trackIndex) => ({
    id: String(track.id || fallback.tracks[trackIndex]?.id || `track-${trackIndex}`),
    kind: String(track.kind || fallback.tracks[trackIndex]?.kind || "video"),
    name: String(track.name || fallback.tracks[trackIndex]?.name || "Track"),
    locked: Boolean(track.locked),
    muted: Boolean(track.muted),
    clips: Array.isArray(track.clips) ? track.clips.map((clip, index) => ({
      ...clip,
      id: String(clip.id || `${track.id}-clip-${index}`),
      start: Math.max(0, toNumber(clip.start)),
      duration: Math.max(0.05, toNumber(clip.duration, 1)),
    })) : [],
  }));
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
