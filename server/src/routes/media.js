import { Router } from "express";
import { prisma } from "../db/client.js";
import { searchPexelsVideos } from "../services/pexelsService.js";

const router = Router();
const MEDIA_KINDS = new Set(["video", "image", "audio", "caption"]);
const MEDIA_ORIGINS = new Set(["upload", "generated", "external", "storyboard"]);

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
    res.status(204).end();
  } catch (error) {
    console.error(`DELETE /api/projects/${req.params.id}/media/${req.params.mediaId} failed:`, error);
    res.status(500).json({ error: "Failed to remove media." });
  }
});

export default router;
