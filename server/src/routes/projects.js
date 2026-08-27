import { Router } from "express";
import { prisma } from "../db/client.js";
import { researchSignal } from "../services/researchService.js";

const router = Router();
const researchJobs = new Map();

function publicProject(project, job) {
  return {
    id: project.id,
    signalId: project.signalId,
    title: project.title,
    status: project.status,
    research: project.researchSummary ? {
      summary: project.researchSummary,
      sources: project.researchSources || [],
      monetizationFlags: project.monetizationFlags || [],
    } : null,
    researchStatus: job?.status || (project.researchSummary ? "ready" : project.status === "researching" ? "researching" : "ready"),
    error: job?.error || null,
  };
}

async function persistSearchSignal(signal) {
  if (signal.id && !String(signal.id).startsWith("search-")) {
    return prisma.signal.findUnique({ where: { id: signal.id } });
  }
  if (!signal.sourceUrl || !signal.title) return null;
  const existing = await prisma.signal.findFirst({ where: { sourceUrl: signal.sourceUrl } });
  if (existing) return existing;
  return prisma.signal.create({
    data: {
      origin: "search",
      sourceType: signal.sourceType || "brave",
      sourceReliability: signal.sourceReliability || "general_web",
      searchQuery: signal.searchQuery || null,
      rank: signal.rank ?? null,
      category: signal.category || "TECHNOLOGY",
      heatPct: signal.heatPct || null,
      heatScore: signal.heatScore ?? null,
      title: String(signal.title).slice(0, 255),
      description: signal.description || null,
      whyReasoning: signal.whyReasoning || "Selected from live search results.",
      sourceName: signal.sourceName || null,
      sourceUrl: signal.sourceUrl,
      rawContent: signal.rawContent || null,
      status: "used",
    },
  });
}

async function runResearch(projectId, signal) {
  researchJobs.set(projectId, { status: "reading", startedAt: new Date().toISOString() });
  try {
    researchJobs.set(projectId, { status: "cross_checking", startedAt: researchJobs.get(projectId)?.startedAt });
    const brief = await researchSignal(signal);
    researchJobs.set(projectId, { status: "drafting", startedAt: researchJobs.get(projectId)?.startedAt });

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        researchSummary: `${brief.mechanism_summary || ""}\n\n${(brief.key_facts || []).map((fact) => `• ${fact}`).join("\n")}`.trim(),
        researchSources: brief.sources || [],
        monetizationFlags: brief.monetization_flags || [],
        suggestedFramework: brief.recommended_framework || null,
        suggestedLengthSeconds: brief.recommended_length_seconds || null,
        suggestedTone: brief.recommended_tone || null,
        status: "setup",
      },
    });
    researchJobs.set(projectId, { status: "ready", completedAt: new Date().toISOString() });
    return updated;
  } catch (error) {
    console.error(`[research] Project ${projectId} failed:`, error);
    researchJobs.set(projectId, { status: "error", error: error.message || "Research failed." });
    await prisma.project.update({ where: { id: projectId }, data: { status: "researching" } }).catch(() => {});
  }
}

router.post("/", async (req, res) => {
  try {
    const signalInput = req.body?.signal;
    const signalId = req.body?.signalId;
    let signal = signalId ? await prisma.signal.findUnique({ where: { id: signalId } }) : null;
    if (!signal && signalInput) signal = await persistSearchSignal(signalInput);
    if (!signal) return res.status(404).json({ error: "Signal not found. Provide signalId or the selected search signal." });

    const project = await prisma.project.create({
      data: { userId: req.body?.userId || "local-user", signalId: signal.id, title: signal.title, status: "researching" },
    });
    researchJobs.set(project.id, { status: "queued" });
    void runResearch(project.id, signal);
    res.status(202).json({ project: publicProject(project, researchJobs.get(project.id)) });
  } catch (error) {
    console.error("POST /api/projects failed:", error);
    res.status(500).json({ error: "Failed to create research project." });
  }
});

router.get("/:id/research", async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: "Project not found." });
    res.json({ project: publicProject(project, researchJobs.get(project.id)) });
  } catch (error) {
    console.error("GET /api/projects/:id/research failed:", error);
    res.status(500).json({ error: "Failed to load research status." });
  }
});

export default router;
