import { Router } from "express";
import { prisma } from "../db/client.js";
import { researchSignal } from "../services/researchService.js";
import { buildSetupSuggestions, validateSetup } from "../services/setupService.js";
import { publishFacebookReel } from "../services/facebookService.js";

const router = Router();
const researchJobs = new Map();

function normalizeRenderUrl(renderUrl) {
  if (!renderUrl) return null;
  return String(renderUrl).replace(/^\/api\/render-files\/projects\//, "/api/render-files/");
}

function publicProject(project, job) {
  return {
    id: project.id,
    signalId: project.signalId,
    title: project.title,
    status: project.status,
    renderUrl: normalizeRenderUrl(project.renderUrl),
    durationSeconds: project.durationSeconds == null ? null : Number(project.durationSeconds),
    cuts: project.cuts ?? null,
    seoCaption: project.seoCaption || null,
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

router.get("/", async (req, res) => {
  try {
    const userId = String(req.query.userId || "local-user");
    const projects = await prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        signal: { select: { category: true, sourceName: true, sourceType: true } },
        _count: { select: { scenes: true, exports: true } },
      },
    });

    res.json({
      projects: projects.map((project) => ({
        id: project.id,
        title: project.title || project.signal?.sourceName || "Untitled research",
        status: project.status,
        createdAt: project.createdAt,
        updatedAt: project.createdAt,
        durationSeconds: project.durationSeconds == null ? null : Number(project.durationSeconds),
        cuts: project.cuts ?? project._count.scenes ?? 0,
        renderUrl: normalizeRenderUrl(project.renderUrl),
        category: project.signal?.category || "TECHNOLOGY",
        sourceName: project.signal?.sourceName || "",
        sourceType: project.signal?.sourceType || "",
        researchReady: Boolean(project.researchSummary),
        setupReady: Boolean(project.scriptLengthSeconds && project.selectedFramework),
        storyboardReady: project._count.scenes > 0,
        narrationReady: project._count.scenes > 0 && project.status !== "researching",
        exportCount: project._count.exports,
      })),
    });
  } catch (error) {
    console.error("GET /api/projects failed:", error);
    res.status(500).json({ error: "Failed to load research history." });
  }
});

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

router.get("/:id", async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: "Project not found." });
    res.json({ project: publicProject(project, researchJobs.get(project.id)) });
  } catch (error) {
    console.error("GET /api/projects/:id failed:", error);
    res.status(500).json({ error: "Failed to load project." });
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

router.post("/:id/publish-facebook", async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (!project.renderUrl) return res.status(409).json({ error: "Render the final MP4 before publishing to Facebook." });

    const result = await publishFacebookReel({
      project,
      title: req.body?.title || project.title,
      description: req.body?.description || project.seoCaption || project.title,
    });

    await prisma.project.update({ where: { id: project.id }, data: { status: "published" } });
    res.status(201).json({ projectId: project.id, ...result });
  } catch (error) {
    console.error(`POST /api/projects/${req.params.id}/publish-facebook failed:`, error);
    const status = error.status === 401 || error.status === 403 ? 502 : error.status === 409 ? 409 : 503;
    res.status(status).json({ error: error.message || "Facebook publishing failed." });
  }
});

export default router;
