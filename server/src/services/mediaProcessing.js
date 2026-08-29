import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db/client.js";
import {
  mediaProxyStoragePaths,
  removeMediaStorageFile,
  resolveStorageKey,
  moveMediaStorageFile,
} from "./mediaStorage.js";

const DEFAULT_PROXY_MIN_BYTES = 50 * 1024 * 1024;
const MAX_PROXY_CONCURRENCY = 1;
const activeIds = new Set();
let scanTimer = null;
let scanRunning = false;

function commandPath(envName, fallback) {
  const configured = String(process.env[envName] || "").trim();
  return configured || fallback;
}

function ffmpegPath() {
  return commandPath("FFMPEG_PATH", "ffmpeg");
}

function ffprobePath() {
  return commandPath("FFPROBE_PATH", "ffprobe");
}

function proxyMinBytes() {
  const configured = Number(process.env.MEDIA_PROXY_MIN_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_PROXY_MIN_BYTES;
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) return resolve({ stdout, stderr });
      const detail = stderr.trim().split(/\r?\n/).slice(-5).join(" ");
      reject(new Error(`${path.basename(command)} failed${signal ? ` (${signal})` : ""}${detail ? `: ${detail}` : "."}`));
    });
  });
}

async function ensureRegularFile(filePath) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error("Media source is not a regular file.");
  return stat;
}

async function probeVideo(filePath) {
  const { stdout } = await runCommand(ffprobePath(), [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,duration:format=duration",
    "-of", "json",
    filePath,
  ]);
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { throw new Error("ffprobe returned invalid metadata."); }
  const stream = parsed.streams?.[0] || {};
  const duration = Number(stream.duration ?? parsed.format?.duration);
  const width = Number(stream.width);
  const height = Number(stream.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) throw new Error("Unable to determine video dimensions.");
  return {
    durationSeconds: Number.isFinite(duration) && duration >= 0 ? duration : null,
    width: Math.min(Math.round(width), 32768),
    height: Math.min(Math.round(height), 32768),
  };
}

async function createProxy(sourcePath, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await runCommand(ffmpegPath(), [
    "-hide_banner", "-loglevel", "error",
    "-y",
    "-i", sourcePath,
    "-map", "0:v:0",
    "-map", "0:a?",
    "-vf", "scale=720:-2:force_original_aspect_ratio=decrease",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "28",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "96k",
    "-movflags", "+faststart",
    outputPath,
  ]);
  await ensureRegularFile(outputPath);
}

export function shouldProxyMedia(media) {
  return media?.origin === "upload"
    && media?.kind === "video"
    && Number(media?.sizeBytes || 0) >= proxyMinBytes();
}

async function hasReadableProxy(storageKey) {
  if (!storageKey) return false;
  try {
    await ensureRegularFile(resolveStorageKey(storageKey));
    return true;
  } catch {
    return false;
  }
}

export async function processMediaProxy(mediaId) {
  if (activeIds.has(mediaId)) return null;
  activeIds.add(mediaId);

  try {
    const media = await prisma.projectMedia.findUnique({ where: { id: mediaId } });
    if (!media || !shouldProxyMedia(media) || !media.storageKey) return null;

    if (media.proxyStorageKey) {
      if (await hasReadableProxy(media.proxyStorageKey)) return media;
      await prisma.projectMedia.update({
        where: { id: media.id },
        data: { proxyStorageKey: null, proxyUrl: null, processingError: null, status: "ready" },
      });
    }

    const sourcePath = resolveStorageKey(media.storageKey);
    await ensureRegularFile(sourcePath);
    const metadata = await probeVideo(sourcePath);
    await prisma.projectMedia.update({
      where: { id: mediaId },
      data: {
        status: "processing",
        processingError: null,
        durationSeconds: metadata.durationSeconds,
        width: metadata.width,
        height: metadata.height,
      },
    });

    const paths = mediaProxyStoragePaths(media.projectId, media.id);
    try {
      await createProxy(sourcePath, paths.tempPath);
      await moveMediaStorageFile(paths.tempStorageKey, paths.storageKey);
      return await prisma.projectMedia.update({
        where: { id: media.id },
        data: {
          status: "ready",
          proxyStorageKey: paths.storageKey,
          proxyUrl: `/api/projects/${media.projectId}/media/${media.id}/proxy`,
          processingError: null,
        },
      });
    } catch (error) {
      await removeMediaStorageFile(paths.tempStorageKey).catch(() => {});
      await removeMediaStorageFile(paths.storageKey).catch(() => {});
      throw error;
    }
  } catch (error) {
    await prisma.projectMedia.update({
      where: { id: mediaId },
      data: { status: "failed", processingError: error.message || "Media processing failed." },
    }).catch(() => {});
    return null;
  } finally {
    activeIds.delete(mediaId);
  }
}

export async function processPendingMedia() {
  if (scanRunning) return;
  scanRunning = true;
  try {
    const candidates = await prisma.projectMedia.findMany({
      where: {
        origin: "upload",
        kind: "video",
        sizeBytes: { gte: BigInt(proxyMinBytes()) },
        proxyStorageKey: null,
        processingError: null,
        status: { in: ["ready", "processing"] },
      },
      orderBy: { createdAt: "asc" },
      take: MAX_PROXY_CONCURRENCY,
    });
    for (const media of candidates) await processMediaProxy(media.id);
  } finally {
    scanRunning = false;
  }
}

export function startMediaProcessor() {
  if (scanTimer) return scanTimer;
  const intervalMs = Math.max(5000, Number(process.env.MEDIA_PROCESSOR_INTERVAL_MS) || 15000);
  scanTimer = setInterval(() => {
    void processPendingMedia().catch((error) => console.error(`[media] processor scan failed: ${error.message}`));
  }, intervalMs);
  if (typeof scanTimer.unref === "function") scanTimer.unref();
  void processPendingMedia().catch((error) => console.error(`[media] initial processor scan failed: ${error.message}`));
  console.log(`[media] proxy processor started (every ${Math.round(intervalMs / 1000)}s; threshold ${Math.round(proxyMinBytes() / (1024 * 1024))} MB).`);
  return scanTimer;
}

export async function retryMediaProxy(mediaId) {
  await prisma.projectMedia.updateMany({
    where: { id: mediaId, origin: "upload", kind: "video" },
    data: { status: "ready", processingError: null, proxyStorageKey: null, proxyUrl: null },
  });
  return processMediaProxy(mediaId);
}
