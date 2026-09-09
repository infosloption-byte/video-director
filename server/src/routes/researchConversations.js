import { Router } from "express";
import crypto from "node:crypto";
import { prisma } from "../db/client.js";
import { researchSignal } from "../services/researchService.js";
import { persistResearchGraph } from "../services/researchGraphService.js";
import { answerResearchQuestion } from "../services/researchMemoryService.js";

const router = Router();
const jobs = new Map();
const MAX_MESSAGES = 60;
const MAX_FOLLOWUPS = 30;

function projectView(project) {
  const job = jobs.get(project.id);
  return {
    id: project.id,
    title: project.title,
    status: project.status,
    researchStatus: job?.status || (project.researchSummary ? "ready" : "researching"),
    researchProgress: Number(job?.progress ?? (project.researchSummary ? 100 : 0)),
    researchStageDetail: job?.detail || null,
    research: project.researchSources || null,
  };
}

function getMessages(project) {
  const stored = project.researchSources && typeof project.researchSources === "object" ? project.researchSources.research_conversation : null;
  if (Array.isArray(stored?.messages) && stored.messages.length) return stored.messages;
  const messages = [{ role: "user", content: project.title }];
  if (project.researchSummary) messages.push({ role: "assistant", content: project.researchSummary, sources: Array.isArray(project.researchSources?.sources) ? project.researchSources.sources.slice(0, 5) : [] });
  return messages;
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

async function runFollowUpResearch(projectId, question) {
  const setJob = (status, progress, detail) => jobs.set(projectId, { status, progress, detail });
  const signal = {
    id: crypto.randomUUID(),
    origin: "search",
    sourceType: "research_conversation",
    sourceReliability: "general_web",
    searchQuery: question,
    category: "TECHNOLOGY",
    title: question,
    description: `Targeted research requested from a user-directed research conversation: ${question}`,
    whyReasoning: "Triggered because the persisted research corpus did not contain sufficiently relevant evidence for the user's follow-up question.",
    status: "used"
  };
  try {
    setJob("planning", 8, "The existing corpus does not cover this question well enough, so Helix is planning a focused evidence search.");
    const brief = await researchSignal(signal, {
      onProgress: (stage, progress) => {
        const detail = ({
          planning: "Planning a focused follow-up around the knowledge gap.",
          discovering: "Searching for sources specific to this unanswered question.",
          reading: "Reading the most relevant follow-up sources.",
          verifying: "Checking the new evidence and its source quality.",
          synthesizing: "Adding the new evidence to the research corpus."
        })[stage] || "Helix is researching the follow-up question.";
        setJob(stage, progress, detail);
      },
      onActivity: (activity) => {
        if (activity?.type === "source.read_started") {
          setJob("reading", 64, `Reading follow-up source: ${activity.title || activity.url || "selected source"}.`);
        }
      }
    });
    await persistResearchGraph(projectId, brief, { status: "completed" });
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { researchSources: true } });
    const current = project?.researchSources && typeof project.researchSources === "object" ? project.researchSources : {};
    const followups = Array.isArray(current.research_followups) ? current.research_followups : [];
    await prisma.project.update({ where: { id: projectId }, data: {
      researchSources: {
        ...current,
        research_followups: [...followups, {
          question,
          searchedAt: new Date().toISOString(),
          sourceCount: Array.isArray(brief.sources) ? brief.sources.length : 0,
          knowledgeGap: true
        }].slice(-MAX_FOLLOWUPS)
      }
    } });
    setJob("ready", 100, "Focused research was added to the persisted corpus. You can continue the conversation.");
  } catch (error) {
    console.error(`[research-conversation] Follow-up for ${projectId} failed:`, error);
    setJob("error", jobs.get(projectId)?.progress || 0, error.message || "Follow-up research failed.");
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
    if (!project.researchSummary || (job && !["ready", "error"].includes(job.status))) return res.status(409).json({ error: "Helix is still researching this topic. Follow-up questions will be available when the corpus is ready." });
    const question = String(req.body?.question || "").trim().slice(0, 2000);
    if (!question) return res.status(400).json({ error: "A research question is required." });
    if (job?.status === "error") jobs.delete(project.id);

    const session = await loadSession(project.id);
    const result = answerResearchQuestion(session, question);
    if (!result.grounded) {
      jobs.set(project.id, { status: "queued", progress: 0, detail: "The existing corpus needs more evidence for this question." });
      void runFollowUpResearch(project.id, question);
      const messages = [...getMessages(project).filter((message) => !message.optimistic), { role: "user", content: question }, { role: "assistant", content: "I don't have enough evidence in the current research corpus for that question. I’m doing a focused research pass now rather than guessing. I’ll add the new evidence to this same research memory.", researchPending: true, sources: [], evidence: [] }].slice(-MAX_MESSAGES);
      const current = project.researchSources && typeof project.researchSources === "object" ? project.researchSources : {};
      await prisma.project.update({ where: { id: project.id }, data: { researchSources: { ...current, research_conversation: { messages } } } });
      return res.status(202).json({ question, grounded: false, searchUsed: true, researchPending: true, answer: "I don't have enough evidence in the current research corpus for that question. I’m doing a focused research pass now rather than guessing.", evidence: [], relatedClaims: [], sources: [], messages, activity: jobs.get(project.id), project: projectView(project) });
    }

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
  const sessions = await prisma.researchSession.findMany({ where: { projectId }, orderBy: { version: "asc" }, include: {
    plan: true,
    sources: { orderBy: { sourceIndex: "asc" } },
    evidence: { orderBy: { evidenceIndex: "asc" } },
    claims: { orderBy: { claimIndex: "asc" }, include: { verification: true, sourceLinks: { include: { source: true } }, evidenceLinks: { include: { evidence: true } } } },
    conflicts: { orderBy: { createdAt: "asc" } }
  } });
  if (!sessions.length) return null;
  const latest = sessions[sessions.length - 1];
  return {
    ...latest,
    sources: sessions.flatMap((item) => item.sources || []),
    evidence: sessions.flatMap((item) => item.evidence || []),
    claims: sessions.flatMap((item) => item.claims || []),
    conflicts: sessions.flatMap((item) => item.conflicts || [])
  };
}

export default router;
