import crypto from "node:crypto";
import { access, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { prisma } from "../db/client.js";
import { getBaseMediaUrl, getRenderToken } from "./editorRenderUrls.js";
import { probeRenderedMedia } from "./mediaProbe.js";

const RENDER_ROOT = path.resolve(process.cwd(), "storage", "renders");
const ENTRY_POINT = path.resolve(process.cwd(), "src", "remotion", "index.jsx");
const COMPOSITION_ID = "HelixEditorReel";
let bundlePromise = null;

function getBundle() {
  if (!bundlePromise) {
    bundlePromise = bundle({ entryPoint: ENTRY_POINT, webpackOverride: (config) => config }).catch((error) => {
      bundlePromise = null;
      throw error;
    });
  }
  return bundlePromise;
}

function hashTimeline(version, timeline) {
  return crypto.createHash("sha256").update(JSON.stringify({ version, timeline })).digest("hex");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function collectMediaIds(timeline) {
  const ids = new Set();
  for (const track of timeline?.tracks || []) {
    for (const clip of track.clips || []) {
      if (clip.mediaId) ids.add(String(clip.mediaId));
    }
  }
  return [...ids];
}

export function timelineHasAudio(timeline) {
  return (timeline?.tracks || [])
    .filter((track) => track.kind === "audio" && !track.muted)
    .some((track) => (track.clips || []).some((clip) => clip.src || clip.mediaId));
}

function withRenderToken(url) {
  const token = getRenderToken();
  if (!token || !url) return url;
  const separator = String(url).includes("?") ? "&" : "?";
  return `${url}${separator}renderToken=${encodeURIComponent(token)}`;
}

function buildClipUrl(projectId, media, clip) {
  if (media) return withRenderToken(`${getBaseMediaUrl()}/api/render-media/${encodeURIComponent(projectId)}/${encodeURIComponent(media.id)}`);
  const raw = String(clip.src || "").trim();
  if (!raw) return null;
  if (raw.startsWith("/api/audio/")) return withRenderToken(`${getBaseMediaUrl()}${raw}`);
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `${getBaseMediaUrl()}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

function resolveTimeline(timeline, mediaById, projectId) {
  return {
    ...timeline,
    fps: 30,
    width: 1080,
    height: 1920,
    tracks: (timeline.tracks || []).map((track) => ({
      ...track,
      clips: (track.clips || []).map((clip) => ({
        ...clip,
        start: Number(Math.max(0, Number(clip.start || 0)).toFixed(3)),
        duration: Number(Math.max(0.05, Number(clip.duration || 0.05)).toFixed(3)),
        offset: Number(Math.max(0, Number(clip.offset || 0)).toFixed(3)),
        src: buildClipUrl(projectId, mediaById.get(String(clip.mediaId || "")), clip),
        volume: clamp(Number(clip.volume ?? 1), 0, 1),
        fadeIn: Math.max(0, Number(clip.fadeIn || 0)),
        fadeOut: Math.max(0, Number(clip.fadeOut || 0)),
      })),
    })),
  };
}

export function validateTimeline(timeline) {
  if (!timeline || typeof timeline !== "object") throw new Error("Editor timeline is missing.");
  const fps = Number(timeline.fps || 30);
  if (fps !== 30) throw new Error("Editor renders currently require a 30fps timeline.");
  if (Number(timeline.width || 1080) !== 1080 || Number(timeline.height || 1920) !== 1920) {
    throw new Error("Editor renders currently require a 1080x1920 vertical timeline.");
  }
  if (!Array.isArray(timeline.tracks)) throw new Error("Editor timeline tracks are missing.");
  const duration = Number(timeline.duration || 0);
  if (!(duration > 0)) throw new Error("Editor timeline has no renderable duration.");
  return duration;
}

async function verifyMedia(projectId, ids) {
  if (!ids.length) return new Map();
  const rows = await prisma.projectMedia.findMany({
    where: { projectId, id: { in: ids } },
    select: { id: true, kind: true, status: true, storageKey: true, proxyStorageKey: true, mediaUrl: true, durationSeconds: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const id of ids) {
    const media = byId.get(id);
    if (!media) throw new Error(`Editor media ${id} is no longer available.`);
    if (media.status !== "ready") throw new Error(`Media ${id} is still processing or has failed. Wait for it to become ready.`);
  }
  return byId;
}

function renderOutputPath(projectId, version, hash) { return path.join(RENDER_ROOT, projectId, "editor", `${version}-${hash}.mp4`); }
function renderUrl(projectId, version, hash) { return `/api/render-files/${encodeURIComponent(projectId)}/editor/${version}-${hash}.mp4`; }
function report(onProgress, stage, stageProgress, message, progress, detail = {}) { if (typeof onProgress !== "function") return; void onProgress({ progress: Math.round(clamp(Number(progress || 0), 0, 100)), stage, stageProgress: Math.round(clamp(Number(stageProgress || 0), 0, 100)), message, ...detail }); }

export async function renderEditorProject(projectId, version, expectedHash, { onProgress } = {}) {
  if (!getRenderToken()) throw new Error("RENDER_ASSET_TOKEN is not configured. Add it to server/.env before editor rendering.");
  const editor = await prisma.projectEditor.findUnique({ where: { projectId } });
  if (!editor) throw new Error("Advanced Editor state not found.");
  if (editor.version !== Number(version)) throw new Error("Editor changed before rendering. Reload and render the latest version.");
  const actualHash = hashTimeline(editor.version, editor.timeline);
  if (actualHash !== expectedHash) throw new Error("Editor timeline hash mismatch. Reload and render again.");
  const duration = validateTimeline(editor.timeline);
  const mediaIds = collectMediaIds(editor.timeline);
  const mediaById = await verifyMedia(projectId, mediaIds);
  const timeline = resolveTimeline(editor.timeline, mediaById, projectId);
  const inputProps = { timeline };
  report(onProgress, "preflight", 100, "Editor timeline validated", 8, { substeps: [{ id: "timeline", label: "Validate canonical timeline", progress: 100 }, { id: "media", label: `Validate ${mediaIds.length} referenced media assets`, progress: 100 }, { id: "version", label: `Lock editor version ${editor.version}`, progress: 100 }] });
  report(onProgress, "bundle", 15, "Bundling the editor composition", 12, { substeps: [{ id: "entry", label: "Resolve editor composition", progress: 100 }, { id: "bundle", label: "Build Remotion bundle", progress: 15 }] });
  const serveUrl = await getBundle();
  report(onProgress, "bundle", 100, "Editor composition bundle ready", 20, { substeps: [{ id: "entry", label: "Resolve editor composition", progress: 100 }, { id: "bundle", label: "Build Remotion bundle", progress: 100 }] });
  const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps });
  report(onProgress, "composition", 100, `Prepared ${duration.toFixed(1)}s editor timeline`, 25, { substeps: [{ id: "select", label: "Select HelixEditorReel", progress: 100 }, { id: "timeline", label: "Resolve canonical timeline", progress: 100 }] });
  const outputPath = renderOutputPath(projectId, editor.version, expectedHash);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const output = { renderUrl: renderUrl(projectId, editor.version, expectedHash), outputPath, durationSeconds: duration };
  report(onProgress, "rendering", 0, `Rendering editor version ${editor.version}`, 25, { substeps: [{ id: "video", label: "Render video timeline", progress: 0 }, { id: "audio", label: "Mix narration and music", progress: 0 }, { id: "captions", label: "Render captions and overlays", progress: 0 }, { id: "encode", label: "Encode H.264 / AAC", progress: 0 }] });
  try {
    await renderMedia({ composition, serveUrl, codec: "h264", audioCodec: "aac", outputLocation: outputPath, inputProps, chromiumOptions: { disableWebSecurity: true }, onProgress: ({ overallProgress = 0 }) => { const stageProgress = Number(overallProgress) * 100; report(onProgress, "rendering", stageProgress, `Rendering editor timeline · ${Math.round(stageProgress)}%`, 25 + Number(overallProgress) * 70, { substeps: [{ id: "video", label: "Render video timeline", progress: stageProgress }, { id: "audio", label: "Mix narration and music", progress: stageProgress }, { id: "captions", label: "Render captions and overlays", progress: stageProgress }, { id: "encode", label: "Encode H.264 / AAC", progress: stageProgress }] }); } });
    const current = await prisma.projectEditor.findUnique({ where: { projectId }, select: { version: true, timeline: true } });
    if (!current || current.version !== editor.version || hashTimeline(current.version, current.timeline) !== expectedHash) { await rm(outputPath, { force: true }).catch(() => {}); throw new Error("Editor changed while rendering. The completed file was discarded; render the latest version again."); }
    await access(outputPath);
    const rendered = await probeRenderedMedia(outputPath);
    if (Math.abs(rendered.durationSeconds - duration) > 0.25) { await rm(outputPath, { force: true }).catch(() => {}); throw new Error(`Rendered duration ${rendered.durationSeconds.toFixed(2)}s differs from editor timeline ${duration.toFixed(2)}s.`); }
    if (timelineHasAudio(editor.timeline) && !rendered.hasAudio) { await rm(outputPath, { force: true }).catch(() => {}); throw new Error("Editor timeline contains audio clips, but the rendered MP4 has no audio stream."); }
    await prisma.projectEditor.update({ where: { projectId }, data: { renderStatus: "ready", renderVersion: editor.version, renderHash: expectedHash, renderUrl: output.renderUrl, renderError: null, renderedAt: new Date() } });
    report(onProgress, "finalizing", 100, "Editor render complete", 100, { substeps: [{ id: "write", label: "Write MP4 file", progress: 100 }, { id: "verify", label: "Verify 1080x1920 MP4 and duration", progress: 100 }, { id: "persist", label: "Persist render version", progress: 100 }], renderVersion: editor.version, renderHash: expectedHash, renderUrl: output.renderUrl, durationSeconds: rendered.durationSeconds, hasAudio: rendered.hasAudio });
    return { ...output, durationSeconds: rendered.durationSeconds };
  } catch (error) {
    await prisma.projectEditor.update({ where: { projectId }, data: { renderStatus: "failed", renderVersion: editor.version, renderHash: expectedHash, renderError: error.message || "Editor render failed." } }).catch(() => {});
    throw error;
  }
}

export function getEditorTimelineHash(version, timeline) { return hashTimeline(version, timeline); }
