import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db/client.js";
import { resolveStorageKey } from "../services/mediaStorage.js";

const router = Router();

router.get("/:projectId/:mediaId", async (req, res) => {
  try {
    const media = await prisma.projectMedia.findFirst({
      where: { id: req.params.mediaId, projectId: req.params.projectId, status: "ready" },
      select: { kind: true, mimeType: true, storageKey: true, proxyStorageKey: true, mediaUrl: true },
    });
    if (!media) return res.status(404).json({ error: "Render media not found." });

    const key = media.proxyStorageKey || media.storageKey;
    if (key) {
      const filePath = resolveStorageKey(key);
      try {
        await fs.access(filePath);
      } catch {
        return res.status(404).json({ error: "Render media file not found." });
      }
      if (media.mimeType) res.type(media.mimeType);
      return res.sendFile(path.resolve(filePath));
    }

    if (media.kind === "caption") return res.status(415).json({ error: "Caption files cannot be rendered as media." });
    return res.redirect(media.mediaUrl);
  } catch (error) {
    console.error(`GET /api/render-media/${req.params.projectId}/${req.params.mediaId} failed:`, error);
    return res.status(500).json({ error: "Failed to resolve render media." });
  }
});

export default router;
