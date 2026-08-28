import { Router } from "express";
import { rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db/client.js";
import { getRenderQueue } from "../jobs/renderQueue.js";

const router = Router();

const STORAGE_ROOT = path.resolve(process.cwd(), "storage");

async function removeIfExists(target) {
  await rm(target, { recursive: true, force: true }).catch(() => {});
}

router.delete("/:id", async (req, res) => {
  try {
    const userId = String(req.query.userId || req.body?.userId || "local-user");
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true, status: true },
    });

    if (!project) return res.status(404).json({ error: "Research project not found." });
    if (project.status === "rendering") {
      return res.status(409).json({ error: "This project is rendering. Wait for the render to finish before deleting it." });
    }

    const queue = getRenderQueue();
    const job = await queue.getJob(project.id).catch(() => null);
    if (job) {
      const state = await job.getState().catch(() => "unknown");
      if (["waiting", "delayed", "prioritized"].includes(state)) {
        await job.remove().catch(() => {});
      }
    }

    await prisma.$transaction(async (tx) => {
      const scenes = await tx.projectScene.findMany({
        where: { projectId: project.id },
        select: { id: true },
      });
      if (scenes.length) {
        await tx.sceneAsset.deleteMany({
          where: { sceneId: { in: scenes.map((scene) => scene.id) } },
        });
      }
      await tx.projectScene.deleteMany({ where: { projectId: project.id } });
      await tx.projectExport.deleteMany({ where: { projectId: project.id } });
      await tx.project.delete({ where: { id: project.id } });
    });

    await Promise.all([
      removeIfExists(path.join(STORAGE_ROOT, "audio", project.id)),
      removeIfExists(path.join(STORAGE_ROOT, "render-assets", project.id)),
      removeIfExists(path.join(STORAGE_ROOT, "renders", project.id)),
      removeIfExists(path.join(STORAGE_ROOT, "exports", project.id)),
    ]);

    res.status(204).send();
  } catch (error) {
    console.error(`DELETE /api/projects/${req.params.id} failed:`, error);
    res.status(500).json({ error: "Failed to delete research project." });
  }
});

export default router;
