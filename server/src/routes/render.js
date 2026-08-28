import { Router } from "express";
import { prisma } from "../db/client.js";
import { enqueueRender, getRenderQueue } from "../jobs/renderQueue.js";
import { narrationFileExists } from "../services/ttsService.js";

const router = Router();

function normalizeProgress(progress) {
  if (progress && typeof progress === "object") {
    return {
      progress: Number(progress.progress || 0),
      stage: progress.stage || "preflight",
      stageProgress: Number(progress.stageProgress || 0),
      message: progress.message || "Preparing render…",
    };
  }
  return {
    progress: Number(progress || 0),
    stage: "rendering",
    stageProgress: Number(progress || 0),
    message: "Rendering video…",
  };
}

router.post("/projects/:id/render", async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { scenes: { select: { id: true, sceneOrder: true, audioUrl: true } } },
    });
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (!project.scenes.length) return res.status(409).json({ error: "Generate the storyboard before rendering." });

    const missingNarration = [];
    for (const scene of project.scenes) {
      if (!scene.audioUrl || !(await narrationFileExists(project.id, scene.id))) missingNarration.push(scene.sceneOrder);
    }
    if (missingNarration.length) {
      return res.status(409).json({
        error: `Narration is missing for scene${missingNarration.length > 1 ? "s" : ""} ${missingNarration.join(", ")}. Return to Storyboard and generate narration again.`,
        code: "NARRATION_MISSING",
        scenes: missingNarration,
      });
    }

    const queue = getRenderQueue();
    const existing = await queue.getJob(project.id);
    if (existing) {
      const state = await existing.getState();
      if (["waiting", "active", "delayed", "prioritized"].includes(state)) {
        return res.status(202).json({ projectId: project.id, jobId: existing.id, status: state, ...normalizeProgress(existing.progress) });
      }
      if (state === "completed" && project.renderUrl) {
        return res.json({ projectId: project.id, jobId: existing.id, status: "completed", progress: 100, stage: "complete", stageProgress: 100, message: "Render complete", renderUrl: project.renderUrl });
      }
      await existing.remove().catch(() => {});
    }

    await prisma.project.update({ where: { id: project.id }, data: { status: "rendering" } });
    const job = await enqueueRender(project.id);
    res.status(202).json({ projectId: project.id, jobId: job.id, status: "queued", progress: 0, stage: "queued", stageProgress: 0, message: "Render queued" });
  } catch (error) {
    console.error(`POST /api/projects/${req.params.id}/render failed:`, error);
    res.status(503).json({ error: error.message || "Render queue is unavailable." });
  }
});

router.get("/projects/:id/render-status", async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id }, select: { id: true, status: true, renderUrl: true } });
    if (!project) return res.status(404).json({ error: "Project not found." });

    if (!process.env.REDIS_URL?.trim()) return res.status(503).json({ error: "Render queue is not configured. Set REDIS_URL in server/.env." });

    const job = await getRenderQueue().getJob(project.id);
    if (!job) {
      return res.json({
        projectId: project.id,
        status: project.renderUrl ? "completed" : "idle",
        progress: project.renderUrl ? 100 : 0,
        stage: project.renderUrl ? "complete" : "preflight",
        stageProgress: project.renderUrl ? 100 : 0,
        message: project.renderUrl ? "Render complete" : "No active render",
        renderUrl: project.renderUrl || null,
      });
    }

    const state = await job.getState();
    const progress = normalizeProgress(job.progress);
    res.json({ projectId: project.id, jobId: job.id, status: state, ...progress, renderUrl: project.renderUrl || null, error: job.failedReason || null });
  } catch (error) {
    console.error(`GET /api/projects/${req.params.id}/render-status failed:`, error);
    res.status(503).json({ error: error.message || "Render status is unavailable." });
  }
});

export default router;
