import { Router } from "express";
import { prisma } from "../db/client.js";
import { cancelResearch, hasActiveResearchController } from "../services/researchCancellation.js";

const router = Router();
const stoppedResearch = new Map();
const STALE_RUN_GRACE_MS = 15000;

function buildStoppedProject(project, state, overrides = {}) {
  return {
    id: project.id,
    signalId: project.signalId,
    title: project.title,
    status: project.status,
    renderUrl: null,
    durationSeconds: project.durationSeconds == null ? null : Number(project.durationSeconds),
    cuts: project.cuts ?? null,
    seoCaption: project.seoCaption || null,
    setup: project.scriptLengthSeconds ? { length: project.scriptLengthSeconds, framework: project.selectedFramework, tone: project.tone, audienceLevel: project.audienceLevel } : null,
    research: project.researchSummary ? { summary: project.researchSummary, sources: project.researchSources || [], monetizationFlags: project.monetizationFlags || [], deepResearch: project.researchSources?.research_metrics || null } : null,
    researchStatus: "error",
    researchProgress: Number(state?.progress ?? overrides.progress ?? 0),
    researchStageLabel: overrides.stageLabel || "Research needs attention",
    researchStageDetail: overrides.stageDetail || "The previous research run is no longer active.",
    error: overrides.error || "The previous research run is no longer active. Retry research to start a new run.",
  };
}

function stoppedActivity(projectId) {
  const state = stoppedResearch.get(projectId);
  return { projectId, status: "error", progress: Number(state?.progress ?? 0), activities: state?.activities || [] };
}

router.post("/:id/research/stop", async (req, res) => {
  try {
    const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!project) return res.status(404).json({ error: "Project not found." });

    const conversationKey = `conversation:${project.id}`;
    if (hasActiveResearchController(conversationKey)) {
      cancelResearch(conversationKey);
      return res.status(202).json({
        conversationStopped: true,
        project: { id: project.id, title: project.title, researchStatus: "conversation", researchProgress: 0, researchStageDetail: "Generation stopped by the user." }
      });
    }

    if (project.researchSummary) return res.status(409).json({ error: "This research is already complete." });
    if (!hasActiveResearchController(project.signalId)) {
      return res.status(409).json({ error: "Research is not currently running. The previous run may have ended or the server may have restarted. Retry research to start again." });
    }
    cancelResearch(project.signalId);
    const current = stoppedResearch.get(project.id) || { progress: 0, activities: [] };
    const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString(), type: "research.stopped", message: "Research was stopped by the user. No incomplete research corpus was persisted." };
    stoppedResearch.set(project.id, { progress: current.progress, activities: [...current.activities, entry].slice(-100) });
    res.status(202).json({ project: buildStoppedProject(project, stoppedResearch.get(project.id), { stageLabel: "Research stopped", stageDetail: "The research run was stopped before the evidence brief was completed.", error: "Research was stopped by the user." }) });
  } catch (error) {
    console.error(`POST /api/projects/${req.params.id}/research/stop failed:`, error);
    res.status(500).json({ error: "Failed to stop research." });
  }
});

router.get("/:id/research", async (req, res, next) => {
  try {
    const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!project) return res.status(404).json({ error: "Project not found." });

    if (stoppedResearch.has(project.id)) {
      if (project.researchSummary) {
        stoppedResearch.delete(project.id);
        return next();
      }
      return res.json({ project: buildStoppedProject(project, stoppedResearch.get(project.id), { stageLabel: "Research stopped", stageDetail: "The research run was stopped before the evidence brief was completed.", error: "Research was stopped by the user." }) });
    }

    const controllerActive = hasActiveResearchController(project.signalId) || hasActiveResearchController(`conversation:${project.id}`);
    const justCreated = project.createdAt && (Date.now() - new Date(project.createdAt).getTime()) < STALE_RUN_GRACE_MS;
    if (!project.researchSummary && project.status === "researching" && !controllerActive && !justCreated) {
      return res.json({ project: buildStoppedProject(project) });
    }

    return next();
  } catch (error) {
    return res.status(500).json({ error: "Failed to load research status." });
  }
});

router.get("/:id/research/activity", async (req, res, next) => {
  if (!stoppedResearch.has(req.params.id)) return next();
  try {
    const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.user.id }, select: { id: true } });
    if (!project) return res.status(404).json({ error: "Project not found." });
    res.json(stoppedActivity(project.id));
  } catch (error) { res.status(500).json({ error: "Failed to load research activity." });
  }
});

router.post("/:id/research/retry", async (req, res, next) => {
  stoppedResearch.delete(req.params.id);
  next();
});

export default router;
