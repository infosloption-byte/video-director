import { Router } from "express";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { prisma } from "../db/client.js";
import { searchPexelsVideos } from "../services/pexelsService.js";
import {
  ensureMediaStorageDirectory,
  mediaStoragePaths,
  moveMediaStorageFile,
  removeMediaStorageFile,
  resolveStorageKey,
} from "../services/mediaStorage.js";

const router = Router();
const MEDIA_KINDS = new Set(["video", "image", "audio", "caption"]);
const MEDIA_ORIGINS = new Set(["upload", "generated", "external", "storyboard"]);
const MAX_UPLOAD_BYTES = {
  video: 500 * 1024 * 1024,
  image: 25 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
  caption: 2 * 1024 * 1024,
};
const MIME_BY_KIND = {
  video: new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/mpeg"]),
  image: new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  audio: new Set(["audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "audio/flac", "audio/mp4", "audio/aac", "audio/x-m4a"]),
  caption: new Set(["text/plain", "text/vtt", "application/x-subrip", "application/ttml+xml"]),
};
const EXTENSIONS_BY_KIND = {
  video: new Set([".mp4", ".webm", ".mov", ".avi", ".mpeg", ".mpg", ".m4v"]),
  image: new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]),
  audio: new Set([".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac"]),
  caption: new Set([".txt", ".srt", ".vtt", ".ttml", ".xml"]),
};
const DEFAULT_EXTENSION = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "video/x-msvideo": ".avi",
  "video/mpeg": ".mpeg",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/flac": ".flac",
  "audio/mp4": ".m4a",
  "audio/aac": ".aac",
  "audio/x-m4a": ".m4a",
  "text/plain": ".txt",
  "text/vtt": ".vtt",
  "application/x-subrip": ".srt",
  "application/ttml+xml": ".ttml",
};

function normalizeKind(value) {
  const kind = String(value || "").toLowerCase();
  return MEDIA_KINDS.has(kind) ? kind : null;
}

function normalizeOrigin(value) {
  const origin = String(value || "").toLowerCase();
  return MEDIA_ORIGINS.has(origin) ? origin : null;
}

function publicMedia(media) {
  return {
    id: media.id,
    projectId: media.projectId,
    kind: media.kind,
    origin: media.origin,
    status: media.status,
    title: media.title,
    filename: media.filename,
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes == null ? null : Number(media.sizeBytes),
    durationSeconds: media.durationSeconds == null ? null : Number(media.durationSeconds),
    width: media.width,
    height: media.height,
    mediaUrl: media.mediaUrl,
    thumbnailUrl: media.thumbnailUrl,
    sourceUrl: media.sourceUrl,
    provider: media.provider,
    providerAssetId: media.providerAssetId,
    createdAt: media.createdAt,
    updatedAt: media.updatedAt,
  };
}

function headerMimeType(req) {
  return String(req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
}

function titleFromFilename(filename) {
  const normalized = String(filename || "").trim();
  const basename = path.basename(normalized);
  const extension = path.extname(basename);
  return (basename.slice(0, extension ? -extension.length : undefined) || "Untitled upload").slice(0, 191);
}

function uploadExtension(kind, mimeType, filename) {
  const extension = path.extname(path.basename(String(filename || ""))).toLowerCase();
  if (extension && EXTENSIONS_BY_KIND[kind].has(extension)) return extension;
  return DEFAULT_EXTENSION[mimeType] || [...EXTENSIONS_BY_KIND[kind]][0];
}

async function readHeader(filePath) {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(32);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function hasPrefix(buffer, values) {
  return values.some((value) => buffer.subarray(0, value.length).equals(value));
}

function looksLikeKnownMedia(header, kind, mimeType) {
  if (kind === "caption") return true;
  if (kind === "image") {
    if (mimeType === "image/jpeg") return header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    if (mimeType === "image/png") return header.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
    if (mimeType === "image/gif") return hasPrefix(header, [Buffer.from("GIF87a"), Buffer.from("GIF89a")]);
    if (mimeType === "image/webp") return header.subarray(0, 4).equals(Buffer.from("RIFF")) && header.subarray(8, 12).equals(Buffer.from("WEBP"));
  }
  if (kind === "video") {
    if (["video/mp4", "video/quicktime"].includes(mimeType)) return header.subarray(4, 8).equals(Buffer.from("ftyp"));
    if (mimeType === "video/webm") return header.subarray(0, 4).equals(Buffer.from("1a45dfa3", "hex"));
    return true;
  }
  if (kind === "audio") {
    if (["audio/wav", "audio/x-wav"].includes(mimeType)) return header.subarray(0, 4).equals(Buffer.from("RIFF")) && header.subarray(8, 12).equals(Buffer.from("WAVE"));
    if (mimeType === "audio/ogg") return header.subarray(0, 4).equals(Buffer.from("OggS"));
    if (mimeType === "audio/flac") return header.subarray(0, 4).equals(Buffer.from("fLaC"));
    if (mimeType === "audio/mpeg") return header.subarray(0, 3).equals(Buffer.from("ID3")) || (header.length >= 2 && header[0] === 0xff && (header[1] & 0xe0) === 0xe0);
    if (mimeType === "audio/mp4") return header.subarray(4, 8).equals(Buffer.from("ftyp"));
    return true;
  }
  return false;
}

router.get("/:id/media", async (req, res) => {
  try {
    const kind = req.query.kind ? normalizeKind(req.query.kind) : null;
    if (req.query.kind && !kind) return res.status(400).json({ error: "Unsupported media kind." });

    const media = await prisma.projectMedia.findMany({
      where: { projectId: req.params.id, ...(kind ? { kind } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ projectId: req.params.id, media: media.map(publicMedia) });
  } catch (error) {
    console.error(`GET /api/projects/${req.params.id}/media failed:`, error);
    res.status(500).json({ error: "Failed to load media library." });
  }
});

router.get("/:id/media/search", async (req, res) => {
  try {
    const query = String(req.query.query || "").trim().slice(0, 120);
    if (!query) return res.status(400).json({ error: "Search query is required." });
    const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 20);
    const results = await searchPexelsVideos(query, limit);
    res.json({ provider: "pexels", query, results });
  } catch (error) {
    console.error(`GET /api/projects/${req.params.id}/media/search failed:`, error);
    res.status(502).json({ error: error.message || "External media search failed." });
  }
});

router.put("/:id/media/upload", async (req, res) => {
  const projectId = req.params.id;
  const kind = normalizeKind(req.query.kind);
  const mimeType = headerMimeType(req);
  const filename = String(req.query.filename || req.headers["x-file-name"] || "").trim().slice(0, 191);
  const title = String(req.query.title || req.headers["x-media-title"] || titleFromFilename(filename)).trim().slice(0, 191);
  const maxBytes = kind ? MAX_UPLOAD_BYTES[kind] : 0;

  if (!kind) return res.status(400).json({ error: "A valid upload media kind is required." });
  if (!MIME_BY_KIND[kind].has(mimeType)) return res.status(415).json({ error: `Unsupported ${kind} MIME type.` });

  const extension = uploadExtension(kind, mimeType, filename);
  if (!EXTENSIONS_BY_KIND[kind].has(extension)) return res.status(400).json({ error: `Unsupported ${kind} file extension.` });

  const contentLength = Number(req.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return res.status(413).json({ error: `File exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB ${kind} upload limit.` });
  }

  let paths;
  try {
    await ensureMediaStorageDirectory(projectId);
    paths = mediaStoragePaths(projectId, extension);
    let bytes = 0;
    const limiter = new Transform({
      transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          const error = new Error(`File exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB ${kind} upload limit.`);
          error.code = "MEDIA_TOO_LARGE";
          callback(error);
          return;
        }
        callback(null, chunk);
      },
    });

    await pipeline(req, limiter, createWriteStream(paths.tempPath, { flags: "wx", mode: 0o600 }));

    if (bytes === 0) return res.status(400).json({ error: "Uploaded file is empty." });

    const header = await readHeader(paths.tempPath);
    if (!looksLikeKnownMedia(header, kind, mimeType)) {
      return res.status(415).json({ error: "Uploaded file content does not match its declared media type." });
    }

    await moveMediaStorageFile(paths.tempStorageKey, paths.storageKey);

    let media;
    try {
      media = await prisma.projectMedia.create({
        data: {
          projectId,
          kind,
          origin: "upload",
          status: "ready",
          title: title || "Untitled upload",
          filename: filename || null,
          mimeType,
          sizeBytes: BigInt(bytes),
          mediaUrl: "pending",
          storageKey: paths.storageKey,
        },
      });
      media = await prisma.projectMedia.update({
        where: { id: media.id },
        data: { mediaUrl: `/api/projects/${projectId}/media/${media.id}/file` },
      });
    } catch (error) {
      await removeMediaStorageFile(paths.storageKey).catch(() => {});
      throw error;
    }

    return res.status(201).json({ media: publicMedia(media), created: true });
  } catch (error) {
    if (paths?.tempStorageKey) await removeMediaStorageFile(paths.tempStorageKey).catch(() => {});
    if (error?.code === "MEDIA_TOO_LARGE") return res.status(413).json({ error: error.message });
    if (req.destroyed || req.aborted) return;
    console.error(`PUT /api/projects/${projectId}/media/upload failed:`, error);
    return res.status(500).json({ error: "Failed to upload media." });
  }
});

router.get("/:id/media/:mediaId/file", async (req, res) => {
  try {
    const media = await prisma.projectMedia.findFirst({
      where: { id: req.params.mediaId, projectId: req.params.id, origin: "upload" },
      select: { storageKey: true, status: true, mimeType: true },
    });
    if (!media?.storageKey || media.status !== "ready") return res.status(404).json({ error: "Media file not found." });

    const filePath = resolveStorageKey(media.storageKey);
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: "Media file not found." });
    }

    if (media.mimeType) res.type(media.mimeType);
    return res.sendFile(filePath);
  } catch (error) {
    console.error(`GET /api/projects/${req.params.id}/media/${req.params.mediaId}/file failed:`, error);
    return res.status(500).json({ error: "Failed to read media file." });
  }
});

router.post("/:id/media", async (req, res) => {
  try {
    const kind = normalizeKind(req.body?.kind);
    const origin = normalizeOrigin(req.body?.origin || "external");
    const mediaUrl = String(req.body?.mediaUrl || "").trim();
    const title = String(req.body?.title || "Untitled media").trim().slice(0, 191);

    if (!kind) return res.status(400).json({ error: "A valid media kind is required." });
    if (!origin) return res.status(400).json({ error: "A valid media origin is required." });
    if (!mediaUrl) return res.status(400).json({ error: "mediaUrl is required." });

    let parsedUrl;
    try {
      parsedUrl = new URL(mediaUrl);
    } catch {
      return res.status(400).json({ error: "mediaUrl must be a valid URL." });
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) return res.status(400).json({ error: "mediaUrl must use HTTP or HTTPS." });

    if (origin === "external" && !req.body?.provider) {
      return res.status(400).json({ error: "External media must identify its provider." });
    }

    const provider = req.body?.provider ? String(req.body.provider).trim().slice(0, 191) : null;
    const providerAssetId = req.body?.providerAssetId ? String(req.body.providerAssetId).trim().slice(0, 191) : null;
    const existing = provider && providerAssetId
      ? await prisma.projectMedia.findFirst({ where: { projectId: req.params.id, provider, providerAssetId } })
      : null;

    if (existing) return res.status(200).json({ media: publicMedia(existing), created: false });

    const media = await prisma.projectMedia.create({
      data: {
        projectId: req.params.id,
        kind,
        origin,
        status: "ready",
        title: title || "Untitled media",
        filename: req.body?.filename ? String(req.body.filename).slice(0, 191) : null,
        mimeType: req.body?.mimeType ? String(req.body.mimeType).slice(0, 191) : null,
        sizeBytes: req.body?.sizeBytes == null ? null : BigInt(Math.max(0, Number(req.body.sizeBytes) || 0)),
        durationSeconds: req.body?.durationSeconds == null ? null : Math.max(0, Number(req.body.durationSeconds) || 0),
        width: req.body?.width == null ? null : Math.max(0, Number(req.body.width) || 0),
        height: req.body?.height == null ? null : Math.max(0, Number(req.body.height) || 0),
        mediaUrl,
        thumbnailUrl: req.body?.thumbnailUrl ? String(req.body.thumbnailUrl) : null,
        sourceUrl: req.body?.sourceUrl ? String(req.body.sourceUrl) : null,
        provider,
        providerAssetId,
        storageKey: req.body?.storageKey ? String(req.body.storageKey) : null,
      },
    });

    res.status(201).json({ media: publicMedia(media), created: true });
  } catch (error) {
    console.error(`POST /api/projects/${req.params.id}/media failed:`, error);
    res.status(500).json({ error: "Failed to add media to library." });
  }
});

router.delete("/:id/media/:mediaId", async (req, res) => {
  try {
    const media = await prisma.projectMedia.findFirst({ where: { id: req.params.mediaId, projectId: req.params.id } });
    if (!media) return res.status(404).json({ error: "Media not found." });
    await prisma.projectMedia.delete({ where: { id: media.id } });
    if (media.origin === "upload" && media.storageKey) await removeMediaStorageFile(media.storageKey).catch(() => {});
    res.status(204).end();
  } catch (error) {
    console.error(`DELETE /api/projects/${req.params.id}/media/${req.params.mediaId} failed:`, error);
    res.status(500).json({ error: "Failed to remove media." });
  }
});

export default router;
