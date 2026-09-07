import { Router } from "express";
import { prisma } from "../db/client.js";
import { researchSignal } from "../services/researchService.js";
import { persistResearchGraph } from "../services/researchGraphService.js";
import { answerResearchQuestion, revalidateStoredBrief } from "../services/researchMemoryService.js";

const router = Router();

async function getResearchSession(projectId, userId) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { id: true } });
  if (!project) return null;
  return prisma.researchSession.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
    include: {
      plan: true,
      sources: { orderBy: { sourceIndex: "asc" } },
      evidence: { orderBy: { evidenceIndex: "asc" } },
      claims: { orderBy: { claimIndex: "asc" }, include: { verification: true, sourceLinks: { include: { source: true } }, evidenceLinks: { include: { evidence: true } } } },
      conflicts: { orderBy: { createdAt: "asc" } }
    }
  });
}

function asText(value) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(asText).filter(Boolean).join(" ");
  return "";
}

function buildStoredBriefFallback(brief) {
  const sourceItems = Array.isArray(brief?.sources) ? brief.sources : [];
  const evidenceItems = Array.isArray(brief?.evidence) ? brief.evidence : [];
  const claimItems = Array.isArray(brief?.claims) ? brief.claims : [];
  const evidence = evidenceItems.map((item, index) => ({
    id: item.id || `brief-evidence-${index + 1}`,
    passageText: asText(item.passageText ?? item.passage ?? item.text ?? item.excerpt ?? item.snippet),
    locator: item.locator || null,
    sourceId: item.sourceId || null,
    evidenceIndex: Number.isInteger(item.evidenceIndex) ? item.evidenceIndex : index + 1,
  })).filter((item) => item.passageText);
  const claims = claimItems.map((item, index) => ({
    id: item.id || `brief-claim-${index + 1}`,
    claimText: asText(item.claimText ?? item.claim ?? item.text),
    verificationStatus: item.verificationStatus || item.status || "stored-brief",
    verifiedConfidence: Number(item.verifiedConfidence ?? item.confidence ?? 0),
  })).filter((item) => item.claimText);

  const summarySections = [
    brief?.executive_summary,
    brief?.mechanism_summary,
    brief?.what_happened,
    brief?.why_it_matters,
    brief?.how_it_works,
    brief?.key_findings,
    brief?.key_facts,
    brief?.important_numbers,
    brief?.safe_claims,
    brief?.creative_opportunities,
  ];
  summarySections.forEach((section, sectionIndex) => {
    const text = asText(section);
    if (!text) return;
    evidence.push({
      id: `brief-summary-${sectionIndex + 1}`,
      passageText: text,
      locator: "Persisted research brief",
      sourceId: null,
      evidenceIndex: evidence.length + 1,
    });
  });

  const sources = sourceItems.map((source, index) => ({
    id: source.id || `brief-source-${index + 1}`,
    title: source.title || source.name || source.url || `Source ${index + 1}`,
    url: source.url || source.link || null,
    readStatus: source.readStatus || "read",
    authorityScore: Number(source.authorityScore || source.authority || 0),
  }));

  return {
    id: `stored-brief-${Date.now()}`,
    version: Number(brief?.version || 1),
    status: "completed",
    createdAt: null,
    completedAt: null,
    plan: null,
    sources,
    evidence,
    claims,
    conflicts: [],
  };
}

// This router is mounted at /api/projects in app.js, so project routes must
// start at /:id rather than /projects/:id.
router.post("/:id/research/rerun", async (req, res) => {
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

router.post("/:id/research/regenerate", async (req, res) => {
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

router.post("/:id/research/chat", async (req, res) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      select: { id: true, researchSources: true }
    });
    if (!project) return res.status(404).json({ error: "Project not found." });

    const question = String(req.body?.question || "").trim().slice(0, 2000);
    if (!question) return res.status(400).json({ error: "A research question is required." });

    const session = await getResearchSession(req.params.id, req.user.id);
    const storedBrief = project.researchSources && typeof project.researchSources === "object" ? project.researchSources : null;
    const corpus = session || (storedBrief ? buildStoredBriefFallback(storedBrief) : null);
    if (!corpus) return res.status(404).json({ error: "Research memory is not available yet." });

    const result = await answerResearchQuestion(corpus, question);
    res.json({ question, ...result, source: session ? "research-corpus" : "persisted-brief" });
  } catch (error) {
    console.error(`POST /api/projects/${req.params.id}/research/chat failed:`, error);
    res.status(500).json({ error: error.message || "Failed to answer the research question." });
  }
});

export default router;
