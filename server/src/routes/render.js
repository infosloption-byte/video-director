import { Router } from "express";
import { prisma } from "../db/client.js";
import { enqueueRender, getRenderQueue } from "../jobs/renderQueue.js";
import { narrationFileExists } from "../services/ttsService.js";
import { requireProjectOwner } from "../middleware/ownership.js";

const router = Router();
router.use("/projects/:id", requireProjectOwner);

function normalizeRenderUrl(renderUrl) {
  if (!renderUrl) return null;
  return String(renderUrl).replace(/^\/api\/render-files\/projects\//, "/api/render-files/");
}

function formatElapsed(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours > 0 ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function buildTiming(job, progress) {
  const queuedAtMs = Number(job?.timestamp || 0);
  const finishedAtMs = Number(job?.finishedOn || 0);
  const endMs = finishedAtMs > 0 ? finishedAtMs : Date.now();
  const elapsedSeconds = queuedAtMs > 0 ? Math.max(0, (endMs - queuedAtMs) / 1000) : 0;
  const normalizedProgress = Math.max(0, Math.min(100, Number(progress || 0)));
  let estimatedRemainingSeconds = null;
  if (!finishedAtMs && normalizedProgress >= 5 && elapsedSeconds > 1) estimatedRemainingSeconds = Math.max(0, elapsedSeconds / (normalizedProgress / 100) - elapsedSeconds);
  return { queuedAt: queuedAtMs ? new Date(queuedAtMs).toISOString() : null, finishedAt: finishedAtMs ? new Date(finishedAtMs).toISOString() : null, elapsedSeconds: Math.round(elapsedSeconds), elapsedLabel: formatElapsed(elapsedSeconds), estimatedRemainingSeconds: estimatedRemainingSeconds == null ? null : Math.round(estimatedRemainingSeconds), estimatedRemainingLabel: estimatedRemainingSeconds == null ? null : formatElapsed(estimatedRemainingSeconds) };
}

function withTimingMessage(message, timing, state) {
  const base = message || "Rendering…";
  if (!timing.elapsedSeconds && !timing.finishedAt) return base;
  if (["completed", "complete"].includes(state)) return `${base} · Total ${timing.elapsedLabel}`;
  const remaining = timing.estimatedRemainingLabel ? ` · ~${timing.estimatedRemainingLabel} remaining` : "";
  return `${base} · ${timing.elapsedLabel} elapsed${remaining}`;
}

router.post("/projects/:id/render", async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id }, include: { scenes: { select: { id: true, sceneOrder: true, audioUrl: true } } } });
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (!project.scenes.length) return res.status(409).json({ error: "Generate the storyboard before rendering." });
    const missingNarration = [];
    for (const scene of project.scenes) if (!scene.audioUrl || !(await narrationFileExists(project.id, scene.id))) missingNarration.push(scene.sceneOrder);
    if (missingNarration.length) return res.status(409).json({ error: `Narration is missing for scene${missingNarration.length > 1 ? "s" : ""} ${missingNarration.join(", ")}. Return to Storyboard and generate narration again.`, code: "NARRATION_MISSING", scenes: missingNarration });
    const queue = getRenderQueue();
    const existing = await queue.getJob(project.id);
    if (existing) {
      const state = await existing.getState();
      if (["waiting", "active", "delayed", "prioritized"].includes(state)) {
        const storedProgress = existing.progress;
        const progressState = storedProgress && typeof storedProgress === "object" ? storedProgress : { progress: Number(storedProgress || 0) };
        const timing = buildTiming(existing, progressState.progress);
        return res.status(202).json({ projectId: project.id, jobId: existing.id, status: state, progress: Number(progressState.progress || 0), stage: progressState.stage || "queued", stageProgress: Number(progressState.stageProgress || 0), message: withTimingMessage(progressState.message || "Waiting for the render worker to start.", timing, state), ...timing });
      }
      if (state === "completed" && project.renderUrl) {
        const timing = buildTiming(existing, 100);
        return res.json({ projectId: project.id, jobId: existing.id, status: "completed", progress: 100, renderUrl: normalizeRenderUrl(project.renderUrl), message: withTimingMessage("Render complete", timing, "completed"), ...timing });
      }
      await existing.remove().catch(() => {});
    }
    await prisma.project.update({ where: { id: project.id }, data: { status: "rendering" } });
    const job = await enqueueRender(project.id);
    const timing = buildTiming(job, 0);
    res.status(202).json({ projectId: project.id, jobId: job.id, status: "queued", progress: 0, stage: "queued", stageProgress: 0, message: "Waiting for the render worker to start.", ...timing });
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
    if (!job) return res.json({ projectId: project.id, status: project.renderUrl ? "completed" : "idle", progress: project.renderUrl ? 100 : 0, renderUrl: normalizeRenderUrl(project.renderUrl) || null });
    const state = await job.getState();
    const storedProgress = job.progress;
    const progressState = storedProgress && typeof storedProgress === "object" ? storedProgress : { progress: Number(storedProgress || 0) };
    const progress = Number(progressState.progress || 0);
    const timing = buildTiming(job, progress);
    res.json({ projectId: project.id, jobId: job.id, status: state, progress, stage: progressState.stage || null, stageProgress: Number(progressState.stageProgress || 0), message: withTimingMessage(progressState.message || null, timing, state), substeps: Array.isArray(progressState.substeps) ? progressState.substeps : [], asset: progressState.asset || null, completedAssets: Number(progressState.completedAssets || 0), totalAssets: Number(progressState.totalAssets || 0), renderUrl: normalizeRenderUrl(project.renderUrl) || null, error: job.failedReason || null, ...timing });
  } catch (error) {
    console.error(`GET /api/projects/${req.params.id}/render-status failed:`, error);
    res.status(503).json({ error: error.message || "Render status is unavailable." });
  }
});

export default router;
