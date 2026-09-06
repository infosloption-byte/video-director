import { Router } from "express";
import { prisma } from "../db/client.js";
import { researchSignal } from "../services/researchService.js";
import { persistResearchGraph } from "../services/researchGraphService.js";
import { revalidateStoredBrief } from "../services/researchMemoryService.js";

const router = Router();

router.post("/projects/:id/research/rerun", async (req, res) => {
  try {
    const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.user.id }, include: { signal: true } });
    if (!project) return res.status(404).json({ error: "Project not found." });
    const focus = String(req.body?.focus || "").trim().slice(0, 400);
    const baseTopic = String(project.signal?.title || project.title || "Research topic").trim();
    const topic = focus ? `${baseTopic}: focus on ${focus}` : baseTopic;
    const signal = { ...project.signal, title: topic, description: focus ? `${project.signal?.description || ""}\nFocused research question: ${focus}`.trim() : project.signal?.description || "" };
    const brief = await researchSignal(signal);
    await prisma.project.update({ where: { id: project.id }, data: {
      researchSummary: `${brief.executive_summary || brief.mechanism_summary || ""}\n\n${(brief.key_facts || []).map((fact) => `• ${fact}`).join("\n")}`.trim(),
      researchSources: { ...(brief), sources: brief.sources || [], rerun: { focused: Boolean(focus), focus: focus || null, previousCorpusRetained: true } },
      monetizationFlags: brief.monetization_flags || [], suggestedFramework: brief.recommended_framework || null,
      suggestedLengthSeconds: brief.recommended_length_seconds || null, suggestedTone: brief.recommended_tone || null,
    } });
    await persistResearchGraph(project.id, brief, { status: "completed" });
    res.status(202).json({ projectId: project.id, focused: Boolean(focus), focus: focus || null, corpusRetained: true, message: "A new research session was created; previous persisted sessions were retained." });
  } catch (error) {
    console.error(`POST /api/projects/${req.params.id}/research/rerun failed:`, error);
    res.status(500).json({ error: error.message || "Failed to rerun research." });
  }
});

router.post("/projects/:id/research/regenerate", async (req, res) => {
  try {
    const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.user.id }, select: { id: true, researchSources: true } });
    if (!project) return res.status(404).json({ error: "Project not found." });
    const storedBrief = project.researchSources && typeof project.researchSources === "object" ? project.researchSources : null;
    if (!storedBrief) return res.status(409).json({ error: "No persisted research brief is available yet." });
    const regenerated = await revalidateStoredBrief(storedBrief);
    await prisma.project.update({ where: { id: project.id }, data: { researchSources: regenerated } });
    res.json({ projectId: project.id, regenerated: true, repeatedExternalResearch: false, researchMetrics: regenerated.research_metrics || null });
  } catch (error) {
    console.error(`POST /api/projects/${req.params.id}/research/regenerate failed:`, error);
    res.status(500).json({ error: error.message || "Failed to regenerate the research brief." });
  }
});

export default router;
