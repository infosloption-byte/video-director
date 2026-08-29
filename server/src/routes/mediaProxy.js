import { Router } from "express";
import fs from "node:fs/promises";
import { prisma } from "../db/client.js";
import { mediaProxyStoragePaths, resolveStorageKey } from "../services/mediaStorage.js";
import { retryMediaProxy, shouldProxyMedia } from "../services/mediaProcessing.js";

const router = Router();

router.get("/:id/media/:mediaId/proxy", async (req, res) => {
  try {
    const media = await prisma.projectMedia.findFirst({
      where: {
        id: req.params.mediaId,
        projectId: req.params.id,
        origin: "upload",
        kind: "video",
      },
      select: {
        id: true,
        projectId: true,
        status: true,
        mimeType: true,
        proxyStorageKey: true,
      },
    });
    if (!media || !shouldProxyMedia(media)) return res.status(404).json({ error: "Editing proxy is not available for this media." });
    if (media.status === "processing") return res.status(409).json({ error: "Editing proxy is still processing." });
    if (media.status === "failed") return res.status(422).json({ error: "Editing proxy processing failed." });
    if (!media.proxyStorageKey) return res.status(404).json({ error: "Editing proxy is not ready." });

    const filePath = resolveStorageKey(media.proxyStorageKey);
    try { await fs.access(filePath); } catch { return res.status(404).json({ error: "Editing proxy file not found." }); }
    res.type("video/mp4");
    return res.sendFile(filePath);
  } catch (error) {
    console.error(`GET /api/projects/${req.params.id}/media/${req.params.mediaId}/proxy failed:`, error);
    return res.status(500).json({ error: "Failed to read editing proxy." });
  }
});

router.post("/:id/media/:mediaId/proxy/retry", async (req, res) => {
  try {
    const media = await prisma.projectMedia.findFirst({
      where: {
        id: req.params.mediaId,
        projectId: req.params.id,
        origin: "upload",
        kind: "video",
      },
      select: { id: true, projectId: true, sizeBytes: true },
    });
    if (!media) return res.status(404).json({ error: "Uploaded video not found." });
    if (!shouldProxyMedia(media)) return res.status(400).json({ error: "This video does not require an editing proxy." });

    void retryMediaProxy(media.id);
    return res.status(202).json({ mediaId: media.id, status: "processing" });
  } catch (error) {
    console.error(`POST /api/projects/${req.params.id}/media/${req.params.mediaId}/proxy/retry failed:`, error);
    return res.status(500).json({ error: "Failed to retry editing proxy." });
  }
});

export default router;
