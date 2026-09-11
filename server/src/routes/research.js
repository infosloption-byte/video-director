import { Router } from "express";
import { prisma } from "../db/client.js";
import { researchSignal } from "../services/researchService.js";
import { persistResearchGraph } from "../services/researchGraphService.js";
import { answerResearchQuestion, buildResearchMemory, resolveResearchConflict, summarizeResearchMetrics, revalidateStoredBrief } from "../services/researchMemoryService.js";

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

function isStrengthQuestion(question) {
  return /\b(strongest|strong|best|reliable|reliab(?:le|ility)|highest confidence|most convincing|most credible)\b/i.test(String(question));
}

function buildStrengthAnswer(corpus) {
  const sources = Array.isArray(corpus?.sources) ? corpus.sources : [];
  const evidence = Array.isArray(corpus?.evidence) ? corpus.evidence : [];
  const claims = Array.isArray(corpus?.claims) ? corpus.claims : [];
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const relatedClaimView = (claim) => ({ id: claim.id, claimText: claim.claimText, verificationStatus: claim.verificationStatus, verifiedConfidence: claim.verifiedConfidence, evidenceLevel: claim.evidenceLevel || null });
  const claimSources = (claim) => (claim?.sourceLinks || []).map((link) => link?.source).filter(Boolean);
  const sourceView = (source) => ({ id: source.id, title: source.title || source.publisher || "Stored source", url: source.url || null, publisher: source.publisher || null, authorityScore: Number(source.authorityScore || 0), readStatus: source.readStatus || null });
  const rankedEvidence = evidence.map((item) => { const source = sourceMap.get(item.sourceId); return { item, authority: Number(source?.authorityScore || 0), hasSource: Boolean(source), quality: Number(item.evidenceQuality || item.qualityScore || item.quality || 0) }; }).sort((a, b) => { if (a.hasSource !== b.hasSource) return a.hasSource ? -1 : 1; return ((b.authority * 0.7) + (b.quality * 0.3)) - ((a.authority * 0.7) + (a.quality * 0.3)); }).slice(0, 5);
  const rankedClaims = claims.map((claim) => {
    const linkedSources = claimSources(claim);
    const sourceAuthority = linkedSources.reduce((sum, source) => sum + Number(source.authorityScore || 0), 0) / Math.max(1, linkedSources.length);
    const corroboration = Number(claim.verification?.corroborationScore || 0);
    const traceableBonus = claim.verification?.traceable ? 15 : 0;
    const confidence = Number(claim.verifiedConfidence || claim.modelConfidence || 0);
    return { claim, sources: linkedSources, score: (confidence * 0.55) + (sourceAuthority * 0.2) + (corroboration * 0.2) + traceableBonus };
  }).filter(({ claim }) => String(claim.claimText || "").trim()).sort((a, b) => b.score - a.score).slice(0, 5);

  if (rankedEvidence.length) {
    const top = rankedEvidence.slice(0, 3).map(({ item, authority, hasSource }, index) => { const source = sourceMap.get(item.sourceId); const attribution = hasSource && source?.title ? ` — ${source.title}` : " — persisted research"; return `${index + 1}. ${item.passageText}${attribution}${authority ? ` (authority ${Math.round(authority)})` : ""}`; }).join("\n");
    return { grounded: true, answer: `The strongest stored evidence is the source-backed material, prioritizing source authority and evidence quality.\n\n${top}`, evidence: rankedEvidence.map(({ item, authority, hasSource }) => { const source = sourceMap.get(item.sourceId); return { id: item.id, passageText: item.passageText, locator: item.locator, sourceId: item.sourceId, evidenceIndex: item.evidenceIndex, sourceTitle: source?.title || null, sourceUrl: source?.url || null, sourceAuthority: authority, sourceBacked: hasSource }; }), relatedClaims: rankedClaims.slice(0, 3).map(({ claim }) => relatedClaimView(claim)), searchUsed: false, sources: [...new Map(rankedEvidence.map(({ item }) => sourceMap.get(item.sourceId)).filter(Boolean).map((source) => [source.id, source])).values()].map(sourceView) };
  }

  if (rankedClaims.length) {
    const top = rankedClaims.slice(0, 3).map(({ claim, sources: linkedSources }, index) => { const attribution = linkedSources[0]?.title || linkedSources[0]?.publisher || "stored research"; const confidence = Number(claim.verifiedConfidence || claim.modelConfidence || 0); return `${index + 1}. ${claim.claimText} — ${attribution} (${claim.verificationStatus || "unverified"}, confidence ${Math.round(confidence)}%)`; }).join("\n");
    const sourceList = [...new Map(rankedClaims.flatMap(({ sources: linkedSources }) => linkedSources).map((source) => [source.id, source])).values()].map(sourceView);
    return { grounded: true, answer: `This research session has no discrete evidence-passage records, but it does contain stored research claims. The strongest support is:\n\n${top}`, evidence: [], relatedClaims: rankedClaims.map(({ claim }) => relatedClaimView(claim)), searchUsed: false, sources: sourceList };
  }

  const readableSources = sources.filter((source) => source.readStatus === "read" && source.readExcerpt);
  if (readableSources.length) {
    const top = readableSources.slice(0, 3).map((source, index) => `${index + 1}. ${source.readExcerpt}`).join("\n");
    return { grounded: true, answer: `The stored session has readable source notes but no discrete evidence records yet. The available source material is:\n\n${top}`, evidence: [], relatedClaims: [], searchUsed: false, sources: readableSources.slice(0, 5).map(sourceView).filter(Boolean) };
  }

  return { grounded: false, answer: "The stored research session has no evidence passages, claims, or readable source notes available for this question. Run a new research session to build a complete evidence-backed corpus.", evidence: [], relatedClaims: [], searchUsed: false, sources: [] };
}

router.get("/:id/research/graph", async (req, res) => {
  try {
    const session = await getResearchSession(req.params.id, req.user.id);
    if (!session) return res.status(404).json({ error: "Research graph is not available." });
    res.json({ projectId: req.params.id, session });
  } catch (error) { console.error(`GET /api/projects/${req.params.id}/research/graph failed:`, error); res.status(500).json({ error: "Failed to load research graph." }); }
});

router.get("/:id/research/memory", async (req, res) => {
  try {
    const session = await getResearchSession(req.params.id, req.user.id);
    if (!session) return res.status(404).json({ error: "Research memory is not available yet." });
    res.json({ projectId: req.params.id, memory: buildResearchMemory(session) });
  } catch (error) { console.error(`GET /api/projects/${req.params.id}/research/memory failed:`, error); res.status(500).json({ error: "Failed to load research memory." }); }
});

router.get("/:id/research/metrics", async (req, res) => {
  try {
    const session = await getResearchSession(req.params.id, req.user.id);
    if (!session) return res.status(404).json({ error: "Research metrics are not available yet." });
    res.json({ projectId: req.params.id, metrics: summarizeResearchMetrics(session) });
  } catch (error) { console.error(`GET /api/projects/${req.params.id}/research/metrics failed:`, error); res.status(500).json({ error: "Failed to load research metrics." }); }
});

router.post("/:id/research/follow-up", async (req, res) => {
  try {
    const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.user.id }, select: { id: true } });
    if (!project) return res.status(404).json({ error: "Project not found." });
    const question = String(req.body?.question || "").trim().slice(0, 2000);
    if (!question) return res.status(400).json({ error: "A research question is required." });
    const session = await getResearchSession(req.params.id, req.user.id);
    if (!session) return res.status(409).json({ error: "The persisted research corpus is not available yet. Complete research before asking Helix." });
    const result = isStrengthQuestion(question) ? buildStrengthAnswer(session) : answerResearchQuestion(session, question);
    res.json({ question, ...result, source: "research-corpus" });
  } catch (error) { console.error(`POST /api/projects/${req.params.id}/research/follow-up failed:`, error); res.status(500).json({ error: error.message || "Failed to answer the research question." }); }
});

router.post("/:id/research/conflicts/:conflictId/resolve", async (req, res) => {
  try {
    const session = await getResearchSession(req.params.id, req.user.id);
    if (!session) return res.status(404).json({ error: "Research graph is not available." });
    const conflict = session.conflicts.find((item) => item.id === req.params.conflictId);
    if (!conflict) return res.status(404).json({ error: "Conflict not found in the current research session." });
    const updated = await resolveResearchConflict(prisma, { conflictId: conflict.id, status: req.body?.status, resolution: req.body?.resolution });
    res.json({ projectId: req.params.id, conflict: updated });
  } catch (error) { console.error(`POST /api/projects/${req.params.id}/research/conflicts/${req.params.id}/resolve failed:`, error); res.status(500).json({ error: error.message || "Failed to update research conflict." }); }
});

router.post("/:id/research/rerun", async (req, res) => {
  try {
    const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.user.id }, include: { signal: true } });
    if (!project) return res.status(404).json({ error: "Project not found." });
    const focus = String(req.body?.focus || "").trim().slice(0, 400);
    const baseTopic = String(project.signal?.title || project.title || "Research topic").trim();
    const topic = focus ? `${baseTopic}: focus on ${focus}` : baseTopic;
    const signal = { ...project.signal, title: topic, description: focus ? `${project.signal?.description || ""}\nFocused research question: ${focus}`.trim() : project.signal?.description || "" };
    const brief = await researchSignal(signal);
    await prisma.project.update({ where: { id: project.id }, data: { researchSummary: `${brief.executive_summary || brief.mechanism_summary || ""}\n\n${(brief.key_facts || []).map((fact) => `• ${fact}`).join("\n")}`.trim(), researchSources: { ...(brief), sources: brief.sources || [], rerun: { focused: Boolean(focus), focus: focus || null, previousCorpusRetained: true } }, monetizationFlags: brief.monetization_flags || [], suggestedFramework: brief.recommended_framework || null, suggestedLengthSeconds: brief.recommended_length_seconds || null, suggestedTone: brief.recommended_tone || null } });
    await persistResearchGraph(project.id, brief, { status: "completed" });
    res.status(202).json({ projectId: project.id, focused: Boolean(focus), focus: focus || null, corpusRetained: true, message: "A new research session was created; previous persisted sessions were retained." });
  } catch (error) { console.error(`POST /api/projects/${req.params.id}/research/rerun failed:`, error); res.status(500).json({ error: error.message || "Failed to rerun research." }); }
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
  } catch (error) { console.error(`POST /api/projects/${req.params.id}/research/regenerate failed:`, error); res.status(500).json({ error: error.message || "Failed to regenerate the research brief." }); }
});

router.post("/:id/research/chat", async (req, res) => {
  try {
    const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.user.id }, select: { id: true } });
    if (!project) return res.status(404).json({ error: "Project not found." });
    const question = String(req.body?.question || "").trim().slice(0, 2000);
    if (!question) return res.status(400).json({ error: "A research question is required." });
    const session = await getResearchSession(req.params.id, req.user.id);
    if (!session) return res.status(409).json({ error: "The persisted research corpus is not available yet. Complete research before asking Helix." });
    const result = isStrengthQuestion(question) ? buildStrengthAnswer(session) : answerResearchQuestion(session, question);
    res.json({ question, ...result, source: "research-corpus" });
  } catch (error) { console.error(`POST /api/projects/${req.params.id}/research/chat failed:`, error); res.status(500).json({ error: error.message || "Failed to answer the research question." }); }
});

export default router;
