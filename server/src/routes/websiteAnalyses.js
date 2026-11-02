import { Router } from "express";
import crypto from "node:crypto";
import { prisma } from "../db/client.js";
import { analyzeWebsite } from "../services/websiteAnalysisService.js";
import { normalizeWebsiteUrl } from "../services/websiteSafeFetch.js";
import { getActivePipelineVersion } from "../services/pipelineService.js";
import { persistResearchGraph } from "../services/researchGraphService.js";
import { recordGenerationTrace } from "../services/generationTelemetry.js";

const router = Router();
const running = new Set();
const MAX_DAILY = 5;

function toPublic(row) {
  const stale = row.status === "running" && Date.now() - new Date(row.updatedAt).getTime() > 4 * 60_000;
  return {
    id: row.id, url: row.url, status: stale ? "interrupted" : row.status,
    progress: row.progress, stage: row.stage, error: stale ? "Analysis was interrupted. Start it again." : row.error,
    report: row.status === "completed" ? row.report : null,
    projectId: row.projectId || null, createdVideos: Array.isArray(row.createdVideos) ? row.createdVideos : [], createdAt: row.createdAt, completedAt: row.completedAt,
  };
}

async function runAnalysis(id, userId, url) {
  if (running.has(id)) return;
  running.add(id);
  const startedAt = new Date();
  try {
    await prisma.websiteAnalysis.update({ where: { id }, data: { status: "running", stage: "Discovering website", error: null, progress: 1 } });
    const report = await analyzeWebsite(url, {
      onProgress: (value, stage) => {
        void prisma.websiteAnalysis.update({
          where: { id }, data: { progress: value, stage },
        }).catch(error => console.warn("[website] Progress update unavailable", error?.code));
      },
    });
    await prisma.websiteAnalysis.update({
      where: { id }, data: { status: "completed", report, progress: 100, stage: "Report ready", completedAt: new Date(), error: null },
    });
    await recordGenerationTrace({
      userId, stage: "research", operation: "website.analyze", status: "completed",
      startedAt, finishedAt: new Date(), provider: "public-website",
    });
  } catch (error) {
    console.warn("[website] Analysis failed:", String(error?.message || error).slice(0, 160));
    await prisma.websiteAnalysis.update({
      where: { id }, data: { status: "failed", stage: "Analysis failed", error: String(error.message || "Website could not be analyzed.").slice(0, 300), progress: 0 },
    }).catch(() => {});
    await recordGenerationTrace({
      userId, stage: "research", operation: "website.analyze", status: "failed",
      startedAt, finishedAt: new Date(), provider: "public-website",
    });
  } finally {
    running.delete(id);
  }
}

function buildWebsiteBrief(report, idea) {
  const selectedPages = report.pages
    .filter(page => idea.evidenceUrls.includes(page.url)).slice(0, 10);
  const pages = selectedPages.length ? selectedPages : report.pages.slice(0, 8);
  const sources = pages.map((page, index) => ({
    index, url: page.url, title: page.title || page.headings?.[0] || report.name,
    source_class: "primary", source_reliability: "general_web",
    read_status: "read", read_excerpt: page.textPreview || page.description || "",
  }));
  const evidence_preview = pages.map((page, index) => ({
    source_index: index, excerpt: (page.description || page.highlights?.[0] || page.textPreview || "").slice(0, 500),
    locator: "Public website page", evidence_type: "website_statement",
  })).filter(row => row.excerpt);
  const key_findings = evidence_preview.map((row, index) => ({
    claim: row.excerpt, evidence: row.excerpt, evidence_level: "business_published",
    confidence: 60, source_indexes: [row.source_index],
  }));
  return {
    executive_summary: [report.name, report.summary, "Selected video concept: " + idea.title,
      "Creative direction: " + idea.angle,
      "Use only business-published facts; no invented prices, offers, statistics, reviews or results.",
      "This website snapshot is not independent factual verification."].filter(Boolean).join("\n\n"),
    sources, evidence_preview, key_findings, key_facts: key_findings.map(x => x.claim),
    verification: { claims: key_findings.map((claim, index) => ({
      claim: claim.claim, verification_status: "website_sourced",
      traceable: true, source_indexes: claim.source_indexes,
      evidence_indexes: [index], verified_confidence: 60, evidence_level: "business_published",
      verification_notes: "Present on a public business website; independently unverified.",
    })) },
    research_plan: [{ name: "Business-published website evidence", scope: report.url }],
    websiteMarketing: { analysisUrl: report.url, ideaId: idea.id, ideaTitle: idea.title, angle: idea.angle },
  };
}

router.use((req, res, next) => {
  if (["POST", "PATCH", "DELETE"].includes(req.method) && process.env.AUTH_REQUIRED === "true" && !req.user?.emailVerifiedAt)
    return res.status(403).json({ code: "EMAIL_VERIFICATION_REQUIRED", error: "Verify your email to analyze websites." });
  next();
});

router.post("/", async (req, res) => {
  let url;
  try { url = normalizeWebsiteUrl(req.body?.url).href; }
  catch (error) { return res.status(400).json({ error: error.message }); }
  try {
    const userId = req.user.id;
    const since = new Date(Date.now() - 24 * 3600_000);
    const [lastDay, active] = await Promise.all([
      prisma.websiteAnalysis.count({ where: { userId, createdAt: { gte: since } } }),
      prisma.websiteAnalysis.count({ where: { userId, status: { in: ["queued", "running"] }, updatedAt: { gte: new Date(Date.now() - 5 * 60_000) } } }),
    ]);
    if (lastDay >= MAX_DAILY) return res.status(429).json({ error: "Website analysis limit reached (5 per 24 hours)." });
    if (active) return res.status(409).json({ error: "Finish your current website analysis before starting another." });
    const item = await prisma.websiteAnalysis.create({ data: { id: crypto.randomUUID(), userId, url, status: "queued" } });
    void runAnalysis(item.id, userId, url);
    res.status(202).json({ analysis: toPublic(item) });
  } catch (error) {
    console.error("[website] Create failed", error?.code || error?.message);
    res.status(500).json({ error: "Unable to start website analysis." });
  }
});

router.get("/", async (req, res) => {
  const items = await prisma.websiteAnalysis.findMany({
    where: { userId: req.user.id }, orderBy: { createdAt: "desc" }, take: 30,
    select: { id: true, url: true, status: true, progress: true, stage: true, error: true, projectId: true, createdAt: true, completedAt: true, updatedAt: true },
  });
  res.json({ analyses: items.map(toPublic) });
});

router.get("/:id", async (req, res) => {
  const item = await prisma.websiteAnalysis.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!item) return res.status(404).json({ error: "Website analysis not found." });
  res.json({ analysis: toPublic(item) });
});

router.post("/:id/retry", async (req, res) => {
  const item = await prisma.websiteAnalysis.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!item) return res.status(404).json({ error: "Website analysis not found." });
  if (["completed", "converting"].includes(item.status)) return res.status(409).json({ error: "This report is already completed." });
  if (running.has(item.id) || (["queued", "running"].includes(item.status) && Date.now() - item.updatedAt.getTime() < 5 * 60_000))
    return res.status(409).json({ error: "Analysis is still running." });
  const allowed = await prisma.websiteAnalysis.count({ where: { userId: req.user.id, updatedAt: { gte: new Date(Date.now() - 24 * 3600_000) }, status: "failed" } });
  if (allowed > 10) return res.status(429).json({ error: "Too many retries. Try again later." });
  void runAnalysis(item.id, req.user.id, item.url);
  res.status(202).json({ analysis: toPublic({ ...item, status: "queued", progress: 0 }) });
});

router.post("/:id/videos", async (req, res) => {
  const userId = req.user.id;
  try {
    const item = await prisma.websiteAnalysis.findFirst({ where: { id: req.params.id, userId } });
    if (!item) return res.status(404).json({ error: "Website analysis not found." });
    if (item.status !== "completed" || !item.report) return res.status(409).json({ error: "Complete website research first." });
    const report = item.report;
    const idea = report.videoIdeas?.find(x => x.id === req.body?.ideaId);
    if (!idea) return res.status(400).json({ error: "Select one of the suggested video ideas." });
    const createdVideos = Array.isArray(item.createdVideos) ? item.createdVideos : [];
    const prior = createdVideos.find(x => x.ideaId === idea.id);
    if (prior) return res.json({ projectId: prior.projectId, reused: true });
    const reserved = await prisma.websiteAnalysis.updateMany({
      where: { id: item.id, userId, status: "completed", projectId: null },
      data: { status: "converting", stage: "Preparing video workspace" },
    });
    if (!reserved.count) return res.status(409).json({ error: "A video project is already being prepared." });
    let created = null;
    try {
      const brief = buildWebsiteBrief(report, idea);
      const pipeline = await getActivePipelineVersion();
      created = await prisma.project.create({
        data: {
          id: crypto.randomUUID(), userId, title: report.name + " — " + idea.title,
          signal: { create: {
            origin: "search", sourceType: "brave", sourceReliability: "general_web", category: "WEBSITE_MARKETING",
            title: report.name.slice(0, 255), description: idea.angle,
            sourceUrl: report.url, sourceName: new URL(report.url).hostname,
            whyReasoning: "Created from bounded website research and selected video concept.",
            status: "used",
          } },
          status: "setup", pipelineVersionId: pipeline.id,
          researchSummary: brief.executive_summary, researchSources: brief,
          suggestedFramework: "EXPLAINER", suggestedLengthSeconds: idea.durationSeconds,
          suggestedTone: "Conversational",
        },
      });
      await persistResearchGraph(created.id, brief);
      await prisma.websiteAnalysis.update({ where: { id: item.id }, data: {
        projectId: item.projectId || created.id,
        createdVideos: [...createdVideos, { ideaId: idea.id, projectId: created.id }],
        status: "completed", stage: "Video workspace ready",
      } });
      return res.status(201).json({ projectId: created.id, path: "/research/" + created.id });
    } catch (error) {
      if (created) {
        // Cascade deletions remove the research graph and dependent project data.
        await prisma.project.delete({ where: { id: created.id } }).catch(() => {});
      }
      await prisma.websiteAnalysis.update({ where: { id: item.id }, data: { status: "completed", stage: "Report ready" } }).catch(() => {});
      throw error;
    }
  } catch (error) {
    console.error("[website] Video project creation failed", error?.code || error?.message);
    res.status(500).json({ error: "Unable to create the video project. Try again." });
  }
});

export default router;
