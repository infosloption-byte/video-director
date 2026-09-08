import { Router } from "express";
import { prisma } from "../db/client.js";
import { cancelResearch, hasActiveResearchController } from "../services/researchCancellation.js";

const router = Router();
const stoppedResearch = new Map();

function buildStoppedProject(project, state) {
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
    researchProgress: Number(state?.progress ?? 0),
    researchStageLabel: "Research stopped",
    researchStageDetail: "The research run was stopped before the evidence brief was completed.",
    error: "Research was stopped by the user.",
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
    if (project.researchSummary) return res.status(409).json({ error: "This research is already complete." });
    if (!hasActiveResearchController(project.signalId) || !cancelResearch(project.signalId)) return res.status(409).json({ error: "Research is not currently running." });
    const current = stoppedResearch.get(project.id) || { progress: 0, activities: [] };
    const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString(), type: "research.stopped", message: "Research was stopped by the user. No incomplete research corpus was persisted." };
    stoppedResearch.set(project.id, { progress: current.progress, activities: [...current.activities, entry].slice(-100) });
    res.status(202).json({ project: buildStoppedProject(project, stoppedResearch.get(project.id)) });
  } catch (error) {
    console.error(`POST /api/projects/${req.params.id}/research/stop failed:`, error);
    res.status(500).json({ error: "Failed to stop research." });
  }
});

router.get("/:id/research", async (req, res, next) => {
  if (!stoppedResearch.has(req.params.id)) return next();
  try {
    const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (project.researchSummary) { stoppedResearch.delete(project.id); return next(); }
    res.json({ project: buildStoppedProject(project, stoppedResearch.get(project.id)) });
  } catch (error) { res.status(500).json({ error: "Failed to load research status." }); }
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
