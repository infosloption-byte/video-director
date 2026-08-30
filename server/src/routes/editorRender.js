import { Router } from "express";
import { getEditorRenderQueue, enqueueEditorRender } from "../jobs/editorRenderQueue.js";
import { prisma } from "../db/client.js";
import { getEditorTimelineHash } from "../services/editorRenderService.js";
import { requireProjectOwner } from "../middleware/ownership.js";

const router = Router();
router.use("/projects/:id", requireProjectOwner);

function normalizeRenderUrl(renderUrl) {
  if (!renderUrl) return null;
  return String(renderUrl).replace(/^\/api\/render-files\/projects\//, "/api/render-files/");
}

function formatElapsed(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function buildTiming(job, progress) {
  const queuedAtMs = Number(job?.timestamp || 0);
  const finishedAtMs = Number(job?.finishedOn || 0);
  const endMs = finishedAtMs > 0 ? finishedAtMs : Date.now();
  const elapsedSeconds = queuedAtMs > 0 ? Math.max(0, (endMs - queuedAtMs) / 1000) : 0;
  const normalizedProgress = Math.max(0, Math.min(100, Number(progress || 0)));
  let estimatedRemainingSeconds = null;
  if (!finishedAtMs && normalizedProgress >= 5 && elapsedSeconds > 1) {
    estimatedRemainingSeconds = Math.max(0, elapsedSeconds / (normalizedProgress / 100) - elapsedSeconds);
  }
  return {
    queuedAt: queuedAtMs ? new Date(queuedAtMs).toISOString() : null,
    finishedAt: finishedAtMs ? new Date(finishedAtMs).toISOString() : null,
    elapsedSeconds: Math.round(elapsedSeconds),
    elapsedLabel: formatElapsed(elapsedSeconds),
    estimatedRemainingSeconds: estimatedRemainingSeconds == null ? null : Math.round(estimatedRemainingSeconds),
    estimatedRemainingLabel: estimatedRemainingSeconds == null ? null : formatElapsed(estimatedRemainingSeconds),
  };
}

function progressPayload(job) {
  const raw = job?.progress;
  return raw && typeof raw === "object" ? raw : { progress: Number(raw || 0) };
}

function withTiming(message, timing, status) {
  const base = message || "Rendering editor timeline…";
  if (status === "completed") return `${base} · Total ${timing.elapsedLabel}`;
  if (!timing.elapsedSeconds) return base;
  return `${base} · ${timing.elapsedLabel} elapsed${timing.estimatedRemainingLabel ? ` · ~${timing.estimatedRemainingLabel} remaining` : ""}`;
}

router.post("/projects/:id/editor/render", async (req, res) => {
  try {
    const editor = await prisma.projectEditor.findUnique({ where: { projectId: req.params.id } });
    if (!editor) return res.status(409).json({ error: "Open the Advanced Editor and save a timeline before rendering." });

    const renderHash = getEditorTimelineHash(editor.version, editor.timeline);
    const queue = getEditorRenderQueue();
    const jobId = `editor-${req.params.id}-${editor.version}-${renderHash}`;
    const existing = await queue.getJob(jobId);

    if (existing) {
      const state = await existing.getState();
      if (["waiting", "active", "delayed", "prioritized"].includes(state)) {
        const progress = progressPayload(existing);
        const timing = buildTiming(existing, progress.progress);
        return res.status(202).json({ projectId: req.params.id, jobId: existing.id, status: state, version: editor.version, renderHash, ...progress, ...timing, message: withTiming(progress.message || "Waiting for the editor render worker.", timing, state) });
      }
      if (state === "completed" && editor.renderVersion === editor.version && editor.renderHash === renderHash && editor.renderUrl) {
        const timing = buildTiming(existing, 100);
        return res.json({ projectId: req.params.id, jobId: existing.id, status: "completed", version: editor.version, renderHash, progress: 100, renderUrl: normalizeRenderUrl(editor.renderUrl), ...timing, message: withTiming("Editor render complete", timing, "completed") });
      }
      if (state === "failed") await existing.remove().catch(() => {});
    }

    await prisma.projectEditor.update({ where: { projectId: req.params.id }, data: { renderStatus: "queued", renderVersion: editor.version, renderHash, renderError: null } });
    const job = await enqueueEditorRender(req.params.id, editor.version, renderHash);
    const timing = buildTiming(job, 0);
    res.status(202).json({ projectId: req.params.id, jobId: job.id, status: "queued", version: editor.version, renderHash, progress: 0, stage: "queued", stageProgress: 0, message: "Waiting for the editor render worker to start.", ...timing });
  } catch (error) {
    console.error(`POST /api/projects/${req.params.id}/editor/render failed:`, error);
    res.status(503).json({ error: error.message || "Editor render queue is unavailable." });
  }
});

router.post("/projects/:id/editor/render/cancel", async (req, res) => {
  try {
    const editor = await prisma.projectEditor.findUnique({ where: { projectId: req.params.id } });
    if (!editor) return res.status(404).json({ error: "Editor state not found." });
    const currentHash = getEditorTimelineHash(editor.version, editor.timeline);
    const jobId = `editor-${req.params.id}-${editor.renderVersion || editor.version}-${editor.renderHash || currentHash}`;
    const job = await getEditorRenderQueue().getJob(jobId);
    if (!job) return res.status(404).json({ error: "No editor render job is queued." });
    const state = await job.getState();
    if (["waiting", "delayed", "prioritized"].includes(state)) {
      await job.remove();
      await prisma.projectEditor.update({ where: { projectId: req.params.id }, data: { renderStatus: "idle", renderError: null } });
      return res.json({ projectId: req.params.id, status: "cancelled", message: "Queued editor render cancelled." });
    }
    if (state === "active") {
      return res.status(409).json({ error: "This editor render is already encoding and cannot be safely cancelled by the queue. Wait for it to finish or restart the dedicated editor render worker.", code: "EDITOR_RENDER_ACTIVE" });
    }
    return res.status(409).json({ error: `Editor render cannot be cancelled from state ${state}.`, status: state });
  } catch (error) {
    console.error(`POST /api/projects/${req.params.id}/editor/render/cancel failed:`, error);
    res.status(503).json({ error: error.message || "Editor render cancellation is unavailable." });
  }
});

router.get("/projects/:id/editor/render-status", async (req, res) => {
  try {
    const editor = await prisma.projectEditor.findUnique({ where: { projectId: req.params.id } });
    if (!editor) return res.status(404).json({ error: "Editor state not found." });

    const currentHash = getEditorTimelineHash(editor.version, editor.timeline);
    const queue = getEditorRenderQueue();
    const jobId = `editor-${req.params.id}-${editor.renderVersion || editor.version}-${editor.renderHash || currentHash}`;
    const job = await queue.getJob(jobId);

    if (!job) {
      if (editor.renderStatus === "ready" && editor.renderVersion === editor.version && editor.renderHash === currentHash && editor.renderUrl) {
        return res.json({ projectId: req.params.id, status: "completed", progress: 100, version: editor.version, renderHash: currentHash, renderUrl: normalizeRenderUrl(editor.renderUrl), error: null });
      }
      return res.json({ projectId: req.params.id, status: editor.renderStatus || "idle", progress: 0, version: editor.version, renderHash: currentHash, renderUrl: null, error: editor.renderError || null });
    }

    const state = await job.getState();
    const progress = progressPayload(job);
    const progressValue = Number(progress.progress || 0);
    const timing = buildTiming(job, progressValue);
    res.json({ projectId: req.params.id, jobId: job.id, status: state, version: Number(job.data?.version || editor.version), renderHash: String(job.data?.renderHash || currentHash), progress: progressValue, stage: progress.stage || null, stageProgress: Number(progress.stageProgress || 0), message: withTiming(progress.message, timing, state), substeps: Array.isArray(progress.substeps) ? progress.substeps : [], renderUrl: state === "completed" ? normalizeRenderUrl(editor.renderUrl) : null, error: job.failedReason || editor.renderError || null, ...timing });
  } catch (error) {
    console.error(`GET /api/projects/${req.params.id}/editor/render-status failed:`, error);
    res.status(503).json({ error: error.message || "Editor render status is unavailable." });
  }
});

export default router;
