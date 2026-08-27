import { Router } from "express";
import { prisma } from "../db/client.js";
import { researchSignal } from "../services/researchService.js";
import { buildSetupSuggestions, validateSetup } from "../services/setupService.js";

const router = Router();
const researchJobs = new Map();

function publicProject(project, job) {
  return {
    id: project.id,
    signalId: project.signalId,
    title: project.title,
    status: project.status,
    renderUrl: project.renderUrl || null,
    setup: project.scriptLengthSeconds ? {
      length: project.scriptLengthSeconds,
      framework: project.selectedFramework,
      tone: project.tone,
      audienceLevel: project.audienceLevel,
    } : null,
    research: project.researchSummary ? {
      summary: project.researchSummary,
      sources: project.researchSources || [],
      monetizationFlags: project.monetizationFlags || [],
    } : null,
    researchStatus: job?.status || (project.researchSummary ? "ready" : project.status === "researching" ? "researching" : "ready"),
    researchProgress: Number(job?.progress ?? (project.researchSummary ? 100 : 0)),
    researchStageLabel: job?.label || null,
    researchStageDetail: job?.detail || null,
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
  const setJob = (status, progress, label, detail) => {
    const existing = researchJobs.get(projectId) || {};
    researchJobs.set(projectId, { ...existing, status, progress, label, detail });
  };

  setJob("reading", 10, "Reading the source", "Extracting the selected signal and its available source content.");
  try {
    const brief = await researchSignal(signal, {
      onProgress: (stage, progress) => {
        const labels = {
          reading: ["Reading the source", "Extracting the selected signal and source content."],
          cross_checking: ["Cross-checking claims", "Comparing the signal with trusted supporting sources."],
          drafting: ["Drafting the research brief", "Turning the verified evidence into a concise creative brief."],
          ready: ["Research brief ready", "The evidence-backed brief is ready for guided setup."],
        };
        const [label, detail] = labels[stage] || [stage, "Helix is working on the research brief."];
        setJob(stage, progress, label, detail);
      },
    });

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
    setJob("ready", 100, "Research brief ready", "The evidence-backed brief is ready for guided setup.");
    return updated;
  } catch (error) {
    console.error(`[research] Project ${projectId} failed:`, error);
    const existing = researchJobs.get(projectId) || {};
    setJob("error", existing.progress || 0, "Research failed", "Helix could not complete the evidence check.");
    researchJobs.set(projectId, { ...researchJobs.get(projectId), error: error.message || "Research failed." });
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
    researchJobs.set(project.id, { status: "queued", progress: 0, label: "Starting research", detail: "Preparing the evidence pipeline." });
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

router.get("/:id/setup/suggestions", async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (!project.researchSummary) return res.status(409).json({ error: "Research is not ready yet." });
    res.json({ suggestions: buildSetupSuggestions(project) });
  } catch (error) {
    console.error("GET /api/projects/:id/setup/suggestions failed:", error);
    res.status(500).json({ error: "Failed to build setup suggestions." });
  }
});

router.post("/:id/setup", async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (!project.researchSummary) return res.status(409).json({ error: "Complete research before setup." });

    const validation = validateSetup(req.body);
    if (validation.error) return res.status(400).json({ error: validation.error });
    const { length, framework, tone, audienceLevel } = validation.value;
    const suggestions = buildSetupSuggestions(project);

    if (suggestions.framework.guardrailApplied && framework === "disruptor") {
      return res.status(400).json({ error: "The Disruptor is blocked for this signal because of a high monetization-risk flag. Choose a safer framework." });
    }

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        scriptLengthSeconds: length,
        selectedFramework: framework,
        frameworkReasoning: suggestions.framework.reasoning,
        tone,
        audienceLevel,
        status: "storyboard",
      },
    });

    res.json({ project: publicProject(updated, researchJobs.get(updated.id)), suggestions });
  } catch (error) {
    console.error("POST /api/projects/:id/setup failed:", error);
    res.status(500).json({ error: "Failed to save setup choices." });
  }
});

export default router;
