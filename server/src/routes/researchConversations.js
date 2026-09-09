import { Router } from "express";
import crypto from "node:crypto";
import { prisma } from "../db/client.js";
import { researchSignal } from "../services/researchService.js";
import { persistResearchGraph } from "../services/researchGraphService.js";
import { answerResearchQuestion } from "../services/researchMemoryService.js";

const router = Router();
const jobs = new Map();
const MAX_MESSAGES = 60;

function projectView(project) {
  return {
    id: project.id,
    title: project.title,
    status: project.status,
    researchStatus: jobs.get(project.id)?.status || (project.researchSummary ? "ready" : "researching"),
    researchProgress: Number(jobs.get(project.id)?.progress ?? (project.researchSummary ? 100 : 0)),
    researchStageDetail: jobs.get(project.id)?.detail || null,
    research: project.researchSources || null,
  };
}

function getMessages(project) {
  const stored = project.researchSources && typeof project.researchSources === "object" ? project.researchSources.research_conversation : null;
  if (Array.isArray(stored?.messages)) return stored.messages;
  return [{ role: "user", content: project.title }];
}

async function runInitialResearch(projectId, signal) {
  const setJob = (status, progress, detail) => jobs.set(projectId, { status, progress, detail });
  try {
    setJob("planning", 5, "Breaking the topic into evidence, mechanism, data, recent developments, and counter-evidence questions.");
    const brief = await researchSignal(signal, { onProgress: (stage, progress) => {
      const detail = ({
        planning: "Breaking the topic into focused research questions.",
        discovering: "Searching academic, institutional, news, and independent sources.",
        reading: "Opening selected sources and extracting available evidence.",
        verifying: "Comparing claims, source quality, and conflicting findings.",
        synthesizing: "Building the evidence-backed research brief.",
        ready: "The research corpus is ready for conversation."
      })[stage] || "Helix is working through the evidence pipeline.";
      setJob(stage, progress, detail);
    } });
    await prisma.project.update({ where: { id: projectId }, data: {
      researchSummary: String(brief.executive_summary || brief.mechanism_summary || "").trim(),
      researchSources: { ...brief, sources: brief.sources || [], research_conversation: { messages: [{ role: "user", content: signal.title }] } },
      monetizationFlags: brief.monetization_flags || [],
      suggestedFramework: brief.recommended_framework || null,
      suggestedLengthSeconds: brief.recommended_length_seconds || null,
      suggestedTone: brief.recommended_tone || null,
      status: "setup"
    } });
    await persistResearchGraph(projectId, brief, { status: "completed" });
    setJob("ready", 100, "The research corpus is ready for conversation.");
  } catch (error) {
    console.error(`[research-conversation] Project ${projectId} failed:`, error);
    setJob("error", jobs.get(projectId)?.progress || 0, error.message || "Research failed.");
    await prisma.project.update({ where: { id: projectId }, data: { status: "researching" } }).catch(() => {});
  }
}

router.post("/", async (req, res) => {
  try {
    const topic = String(req.body?.topic || "").trim().slice(0, 255);
    if (topic.length < 3) return res.status(400).json({ error: "Enter a research topic to begin." });
    const signal = await prisma.signal.create({ data: {
      id: crypto.randomUUID(),
      origin: "search",
      sourceType: "brave",
      sourceReliability: "general_web",
      searchQuery: topic,
      category: "TECHNOLOGY",
      title: topic,
      description: `User-directed research topic: ${topic}`,
      whyReasoning: "Started directly by the user from Research with Helix.",
      status: "used"
    } });
    const project = await prisma.project.create({ data: { id: crypto.randomUUID(), userId: req.user.id, signalId: signal.id, title: topic, status: "researching" } });
    jobs.set(project.id, { status: "queued", progress: 0, detail: "Preparing the evidence pipeline." });
    void runInitialResearch(project.id, signal);
    res.status(202).json({ project: projectView(project), messages: [{ role: "user", content: topic }] });
  } catch (error) {
    console.error("POST /api/research-conversations failed:", error);
    res.status(500).json({ error: "Failed to start research conversation." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!project) return res.status(404).json({ error: "Research conversation not found." });
    res.json({ project: projectView(project), messages: getMessages(project), activity: jobs.get(project.id) || null });
  } catch (error) {
    console.error(`GET /api/research-conversations/${req.params.id} failed:`, error);
    res.status(500).json({ error: "Failed to load research conversation." });
  }
});

router.post("/:id/messages", async (req, res) => {
  try {
    const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!project) return res.status(404).json({ error: "Research conversation not found." });
    const job = jobs.get(project.id);
    if (!project.researchSummary || job?.status !== "ready") return res.status(409).json({ error: "Helix is still researching this topic. Follow-up questions will be available when the corpus is ready." });
    const question = String(req.body?.question || "").trim().slice(0, 2000);
    if (!question) return res.status(400).json({ error: "A research question is required." });
    const result = answerResearchQuestion(await loadSession(project.id), question);
    const messages = [...getMessages(project).filter((message) => !message.optimistic), { role: "user", content: question }, { role: "assistant", content: result.answer, sources: result.sources || [], evidence: result.evidence || [] }].slice(-MAX_MESSAGES);
    const current = project.researchSources && typeof project.researchSources === "object" ? project.researchSources : {};
    await prisma.project.update({ where: { id: project.id }, data: { researchSources: { ...current, research_conversation: { messages } } } });
    res.json({ question, ...result, source: "research-corpus", messages });
  } catch (error) {
    console.error(`POST /api/research-conversations/${req.params.id}/messages failed:`, error);
    res.status(500).json({ error: error.message || "Failed to answer the research question." });
  }
});

async function loadSession(projectId) {
  return prisma.researchSession.findFirst({ where: { projectId }, orderBy: { version: "desc" }, include: {
    plan: true,
    sources: { orderBy: { sourceIndex: "asc" } },
    evidence: { orderBy: { evidenceIndex: "asc" } },
    claims: { orderBy: { claimIndex: "asc" }, include: { verification: true, sourceLinks: { include: { source: true } }, evidenceLinks: { include: { evidence: true } } } },
    conflicts: { orderBy: { createdAt: "asc" } }
  } });
}

export default router;
