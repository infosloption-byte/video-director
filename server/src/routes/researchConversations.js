import { Router } from "express";
import crypto from "node:crypto";
import { prisma } from "../db/client.js";
import { researchSignal } from "../services/researchService.js";
import { persistResearchGraph } from "../services/researchGraphService.js";
import { answerResearchConversation } from "../services/researchConversationService.js";
import { answerResearchQuestion } from "../services/researchMemoryService.js";

const router = Router();
const jobs = new Map();
const subscribers = new Map();
const MAX_MESSAGES = 60;
const MAX_FOLLOWUPS = 30;
const MAX_ACTIVITY = 120;
const MAX_DISCOVERED_SOURCES = 12;
const RESEARCH_CONTEXT_MESSAGES = 20;
const RESEARCH_STAGES = new Set(["queued", "planning", "discovering", "reading", "verifying", "synthesizing", "stopped", "error"]);

function projectView(project) {
  const job = jobs.get(project.id);
  const researchStatus = job?.status || (project.researchSummary ? "ready" : "conversation");
  return {
    id: project.id,
    title: project.title,
    status: project.status,
    researchStatus,
    researchProgress: Number(job?.progress ?? (project.researchSummary ? 100 : 0)),
    researchStageDetail: job?.detail || null,
    research: project.researchSources || null,
  };
}

function getStoredConversation(project) {
  return project.researchSources && typeof project.researchSources === "object"
    ? project.researchSources.research_conversation
    : null;
}

function getMessages(project) {
  const stored = getStoredConversation(project);
  if (Array.isArray(stored?.messages) && stored.messages.length) return stored.messages;
  const messages = [{ id: `topic-${project.id}`, role: "user", content: project.title }];
  if (project.researchSummary) messages.push({
    id: `brief-${project.id}`,
    role: "assistant",
    content: project.researchSummary,
    sources: Array.isArray(project.researchSources?.sources) ? project.researchSources.sources.slice(0, 5) : [],
    researchBrief: true,
    grounded: true,
    source: "deep-research"
  });
  return messages;
}

function defaultJob(project) {
  const researching = Boolean(project.researchSummary);
  return {
    status: researching ? "ready" : "conversation",
    progress: researching ? 100 : 0,
    detail: researching ? "The research corpus is ready for conversation." : "Conversation is ready. Explore the topic, then build the research brief when you are satisfied with the direction.",
    messageId: null,
    question: null,
    conversationThinking: false,
    activity: [],
    discoveredSources: []
  };
}

function ensureJob(projectId, fallbackProject = null) {
  if (!jobs.has(projectId) && fallbackProject) jobs.set(projectId, defaultJob(fallbackProject));
  if (!jobs.has(projectId)) jobs.set(projectId, { status: "conversation", progress: 0, detail: "Conversation is ready.", messageId: null, question: null, conversationThinking: false, activity: [], discoveredSources: [] });
  return jobs.get(projectId);
}

function jobSnapshot(projectId) {
  const job = jobs.get(projectId);
  if (!job) return null;
  return {
    status: job.status,
    progress: Number(job.progress || 0),
    detail: job.detail || null,
    messageId: job.messageId || null,
    question: job.question || null,
    conversationThinking: Boolean(job.conversationThinking),
    activity: Array.isArray(job.activity) ? job.activity.slice(-MAX_ACTIVITY) : [],
    discoveredSources: Array.isArray(job.discoveredSources) ? job.discoveredSources.slice(-MAX_DISCOVERED_SOURCES) : [],
  };
}

function sendSse(res, event, payload) { res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`); }
function emit(projectId, event, payload) {
  const listeners = subscribers.get(projectId);
  if (!listeners?.size) return;
  for (const res of listeners) sendSse(res, event, payload);
}
function updateJob(projectId, changes) {
  const current = ensureJob(projectId);
  const next = { ...current, ...changes };
  jobs.set(projectId, next);
  emit(projectId, "job", jobSnapshot(projectId));
  return next;
}

function activityMessage(activity = {}) {
  if (activity.message) return String(activity.message);
  const messages = {
    "plan.created": "Research plan prepared.",
    "search.started": "Searching for relevant sources.",
    "search.completed": "Source discovery pass completed.",
    "source.discovered": "A new source was surfaced for review.",
    "source.read_started": "Opening a source and reading its available content.",
    "source.read_complete": "Source content was read successfully.",
    "source.read_failed": "A source could not be read and remains unverified.",
    "verification.completed": "Source traceability and claim verification completed.",
    "verification.adjudicated": "Evidence conflicts were evaluated.",
  };
  return messages[activity.type] || "Helix is processing the research evidence.";
}

function sourceCandidate(item) {
  if (!item || typeof item !== "object") return null;
  const url = item.url || item.sourceUrl || item.source_url || null;
  if (!url) return null;
  return { url: String(url), title: item.title || item.name || String(url), sourceClass: item.source_class || item.sourceClass || item.source_type || null };
}
function discoveredSourcesFrom(activity = {}) {
  const candidates = [];
  const direct = sourceCandidate(activity);
  if (direct) candidates.push(direct);
  for (const key of ["source", "result"]) {
    const item = sourceCandidate(activity[key]);
    if (item) candidates.push(item);
  }
  for (const key of ["sources", "results", "items"]) {
    if (Array.isArray(activity[key])) candidates.push(...activity[key].map(sourceCandidate).filter(Boolean));
  }
  return candidates;
}
function recordActivity(projectId, activity, { messageId = null } = {}) {
  if (!activity || typeof activity !== "object") return;
  const current = ensureJob(projectId);
  const event = {
    id: crypto.randomUUID(), messageId: messageId || current.messageId || null, at: new Date().toISOString(),
    type: String(activity.type || "research.activity"), message: activityMessage(activity), title: activity.title || null,
    url: activity.url || activity.sourceUrl || null, status: activity.status || null,
    sourceClass: activity.source_class || activity.sourceClass || null,
  };
  const activityHistory = [...(current.activity || []), event].slice(-MAX_ACTIVITY);
  const discovered = [...(current.discoveredSources || [])];
  for (const candidate of discoveredSourcesFrom(activity)) if (!discovered.some((item) => item.url === candidate.url)) discovered.push(candidate);
  const next = { ...current, activity: activityHistory, discoveredSources: discovered.slice(-MAX_DISCOVERED_SOURCES) };
  jobs.set(projectId, next);
  emit(projectId, "activity", event);
  emit(projectId, "sources", next.discoveredSources);
}

async function persistConversationMessages(projectId, messages, extra = {}) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { researchSources: true } });
  if (!project) return;
  const current = project.researchSources && typeof project.researchSources === "object" ? project.researchSources : {};
  await prisma.project.update({ where: { id: projectId }, data: { researchSources: { ...current, ...extra, research_conversation: { ...(current.research_conversation || {}), messages: messages.slice(-MAX_MESSAGES) } } } });
}
function buildResearchContext(topic, messages) {
  const context = messages.slice(-RESEARCH_CONTEXT_MESSAGES)
    .map((message) => `${message.role === "user" ? "USER" : "HELIX"}: ${String(message.content || "").trim()}`)
    .filter(Boolean).join("\n\n").slice(0, 10000);
  return context ? `${topic}\n\nResearch direction from the conversation:\n${context}` : topic;
}

async function runInitialResearch(projectId, signal, conversationMessages) {
  const researchTopic = buildResearchContext(signal.title, conversationMessages);
  const researchSignalInput = { ...signal, title: researchTopic };
  const setJob = (status, progress, detail) => updateJob(projectId, { status, progress, detail, messageId: "initial", question: signal.title, conversationThinking: false });
  try {
    setJob("planning", 5, "Scanning the conversation to turn your questions and priorities into a focused research plan.");
    const brief = await researchSignal(researchSignalInput, {
      onProgress: (stage, progress) => {
        const detail = ({
          planning: "Using the conversation to define focused evidence lanes.", discovering: "Searching academic, institutional, news, and independent sources.",
          reading: "Opening selected sources and extracting available evidence.", verifying: "Comparing claims, source quality, and conflicting findings.",
          synthesizing: "Building the evidence-backed research brief from the full research pass.", ready: "The research corpus is ready for conversation."
        })[stage] || "Helix is working through the evidence pipeline.";
        setJob(stage, progress, detail);
      },
      onActivity: (activity) => recordActivity(projectId, activity, { messageId: "initial" }),
    });
    const storedMessages = conversationMessages.slice(-MAX_MESSAGES);
    const completedMessage = {
      id: `brief-${projectId}-${Date.now()}`, role: "assistant",
      content: String(brief.executive_summary || brief.mechanism_summary || "The evidence-backed research brief is ready.").trim(),
      sources: Array.isArray(brief.sources) ? brief.sources.slice(0, 5) : [],
      evidence: Array.isArray(brief.evidence_preview) ? brief.evidence_preview.slice(0, 5) : [], grounded: true, researchBrief: true, source: "deep-research"
    };
    await prisma.project.update({ where: { id: projectId }, data: {
      researchSummary: completedMessage.content,
      researchSources: { ...brief, sources: brief.sources || [], research_conversation: { messages: [...storedMessages, completedMessage].slice(-MAX_MESSAGES) }, research_conversation_context: researchTopic.slice(signal.title.length).trim() },
      monetizationFlags: brief.monetization_flags || [], suggestedFramework: brief.recommended_framework || null,
      suggestedLengthSeconds: brief.recommended_length_seconds || null, suggestedTone: brief.recommended_tone || null, status: "setup"
    } });
    await persistResearchGraph(projectId, brief, { status: "completed" });
    emit(projectId, "conversation", { messages: [...storedMessages, completedMessage].slice(-MAX_MESSAGES) });
    setJob("ready", 100, "The research corpus is ready for conversation.");
  } catch (error) {
    console.error(`[research-conversation] Project ${projectId} failed:`, error);
    setJob("error", jobs.get(projectId)?.progress || 0, error.message || "Research failed.");
    await prisma.project.update({ where: { id: projectId }, data: { status: "researching" } }).catch(() => {});
  }
}

async function runFollowUpResearch(projectId, question, messageId) {
  const setJob = (status, progress, detail) => updateJob(projectId, { status, progress, detail, messageId, question, conversationThinking: false });
  const signal = { id: crypto.randomUUID(), origin: "search", sourceType: "research_conversation", sourceReliability: "general_web", searchQuery: question, category: "TECHNOLOGY", title: question, description: `Targeted research requested from a user-directed research conversation: ${question}`, whyReasoning: "Triggered because the persisted research corpus did not contain sufficiently relevant evidence for the user's follow-up question.", status: "used" };
  try {
    setJob("planning", 8, "The existing corpus does not cover this question well enough, so Helix is planning a focused evidence search.");
    const brief = await researchSignal(signal, {
      onProgress: (stage, progress) => {
        const detail = ({ planning: "Planning a focused follow-up around the knowledge gap.", discovering: "Searching for sources specific to this unanswered question.", reading: "Reading the most relevant follow-up sources.", verifying: "Checking the new evidence and its source quality.", synthesizing: "Adding the new evidence to the research corpus." })[stage] || "Helix is researching the follow-up question.";
        setJob(stage, progress, detail);
      },
      onActivity: (activity) => recordActivity(projectId, activity, { messageId }),
    });
    await persistResearchGraph(projectId, brief, { status: "completed" });
    const session = await loadSession(projectId);
    const result = answerResearchQuestion(session, question);
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { researchSources: true } });
    const current = project?.researchSources && typeof project.researchSources === "object" ? project.researchSources : {};
    const stored = Array.isArray(current.research_conversation?.messages) ? current.research_conversation.messages : [];
    const followups = Array.isArray(current.research_followups) ? current.research_followups : [];
    const messages = [...stored].map((message) => message.id === `${messageId}:assistant`
      ? { ...message, content: result.answer, sources: result.sources || [], evidence: result.evidence || [], researchPending: false, grounded: result.grounded, source: "research-corpus" } : message);
    await prisma.project.update({ where: { id: projectId }, data: { researchSources: { ...current, research_followups: [...followups, { question, searchedAt: new Date().toISOString(), sourceCount: Array.isArray(brief.sources) ? brief.sources.length : 0, knowledgeGap: true }].slice(-MAX_FOLLOWUPS), research_conversation: { messages: messages.slice(-MAX_MESSAGES) } } } });
    emit(projectId, "conversation", { messages: messages.slice(-MAX_MESSAGES) });
    recordActivity(projectId, { type: "message.completed", message: result.grounded ? "Focused research answer is ready." : "Focused research completed, but the new corpus still cannot support this question without guessing." }, { messageId });
    setJob("ready", 100, result.grounded ? "Focused research was added and the follow-up answer is ready." : "Focused research completed; the evidence is still insufficient to answer safely.");
  } catch (error) {
    console.error(`[research-conversation] Follow-up for ${projectId} failed:`, error);
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { researchSources: true } }).catch(() => null);
    const current = project?.researchSources && typeof project.researchSources === "object" ? project.researchSources : {};
    const stored = Array.isArray(current.research_conversation?.messages) ? current.research_conversation.messages : [];
    const messages = stored.map((message) => message.id === `${messageId}:assistant`
      ? { ...message, content: "The focused research pass failed. No new evidence was added to the corpus, so Helix will not guess an answer.", researchPending: false, researchError: true, grounded: false } : message);
    await prisma.project.update({ where: { id: projectId }, data: { researchSources: { ...current, research_conversation: { messages } } } }).catch(() => {});
    emit(projectId, "conversation", { messages });
    recordActivity(projectId, { type: "message.failed", message: error.message || "Focused research failed." }, { messageId });
    setJob("error", jobs.get(projectId)?.progress || 0, error.message || "Follow-up research failed.");
  }
}

router.post("/", async (req, res) => {
  try {
    const topic = String(req.body?.topic || "").trim().slice(0, 255);
    if (topic.length < 3) return res.status(400).json({ error: "Enter a research topic to begin." });
    const signal = await prisma.signal.create({ data: { id: crypto.randomUUID(), origin: "search", sourceType: "brave", sourceReliability: "general_web", searchQuery: topic, category: "TECHNOLOGY", title: topic, description: `User-directed research topic: ${topic}`, whyReasoning: "Started directly by the user from Research with Helix.", status: "used" } });
    const project = await prisma.project.create({ data: { id: crypto.randomUUID(), userId: req.user.id, signalId: signal.id, title: topic, status: "researching" } });
    jobs.set(project.id, { status: "conversation", progress: 0, detail: "Conversation is ready. Explore the topic before building the research brief.", messageId: null, question: topic, conversationThinking: false, activity: [], discoveredSources: [] });
    res.status(202).json({ project: projectView(project), messages: [{ id: `topic-${project.id}`, role: "user", content: topic }], activity: jobSnapshot(project.id) });
  } catch (error) {
    console.error("POST /api/research-conversations failed:", error);
    res.status(500).json({ error: "Failed to start research conversation." });
  }
});

router.get("/:id/events", async (req, res) => {
  try {
    const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!project) return res.status(404).json({ error: "Research conversation not found." });
    ensureJob(project.id, project);
    res.status(200); res.setHeader("Content-Type", "text/event-stream; charset=utf-8"); res.setHeader("Cache-Control", "no-cache, no-transform"); res.setHeader("Connection", "keep-alive"); res.flushHeaders?.();
    const listeners = subscribers.get(project.id) || new Set();
    listeners.add(res); subscribers.set(project.id, listeners);
    sendSse(res, "snapshot", { project: projectView(project), activity: jobSnapshot(project.id) });
    const heartbeat = setInterval(() => { if (!res.writableEnded) res.write(": keep-alive\n\n"); }, 15000);
    const cleanup = () => { clearInterval(heartbeat); listeners.delete(res); if (!listeners.size) subscribers.delete(project.id); };
    req.on("close", cleanup); res.on("close", cleanup);
  } catch (error) {
    console.error(`GET /api/research-conversations/${req.params.id}/events failed:`, error);
    if (!res.headersSent) res.status(500).json({ error: "Failed to open research activity stream." }); else res.end();
  }
});

router.get("/:id", async (req, res) => {
  try {
    const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!project) return res.status(404).json({ error: "Research conversation not found." });
    ensureJob(project.id, project);
    res.json({ project: projectView(project), messages: getMessages(project), activity: jobSnapshot(project.id) });
  } catch (error) {
    console.error(`GET /api/research-conversations/${req.params.id} failed:`, error);
    res.status(500).json({ error: "Failed to load research conversation." });
  }
});

router.post("/:id/brief", async (req, res) => {
  try {
    const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!project) return res.status(404).json({ error: "Research conversation not found." });
    if (project.researchSummary) return res.status(409).json({ error: "The research brief has already been built.", project: projectView(project) });
    const job = jobs.get(project.id);
    if (job && RESEARCH_STAGES.has(job.status)) return res.status(409).json({ error: "The research brief is already being built." });
    const messages = getMessages(project).filter((message) => message.role === "user" || message.role === "assistant").slice(-MAX_MESSAGES);
    const signal = await prisma.signal.findUnique({ where: { id: project.signalId } });
    if (!signal) return res.status(409).json({ error: "The original research topic could not be found." });
    updateJob(project.id, { status: "queued", progress: 0, detail: "Scanning the conversation and preparing the evidence pipeline.", messageId: "initial", question: project.title, activity: [], discoveredSources: [], conversationThinking: false });
    await persistConversationMessages(project.id, messages);
    void runInitialResearch(project.id, signal, messages);
    res.status(202).json({ researchPending: true, message: "I’m scanning the conversation and starting the full evidence-backed research pass.", project: projectView(project), messages, activity: jobSnapshot(project.id) });
  } catch (error) {
    console.error(`POST /api/research-conversations/${req.params.id}/brief failed:`, error);
    res.status(500).json({ error: error.message || "Failed to build the research brief." });
  }
});

router.post("/:id/messages", async (req, res) => {
  try {
    const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!project) return res.status(404).json({ error: "Research conversation not found." });
    const question = String(req.body?.question || "").trim().slice(0, 2000);
    if (!question) return res.status(400).json({ error: "A research question is required." });
    const job = jobs.get(project.id);
    const conversationMode = !project.researchSummary && (!job || job.status === "conversation");
    const ready = Boolean(project.researchSummary) && (!job || ["ready", "error"].includes(job.status));
    if (!conversationMode && !ready) return res.status(409).json({ error: "The research brief is being built. Follow-up questions will be available when the research corpus is ready." });

    if (conversationMode) {
      const currentMessages = getMessages(project).filter((message) => !message.optimistic);
      const initial = req.body?.initial === true && currentMessages.length === 1 && currentMessages[0]?.role === "user";
      const userMessage = { id: crypto.randomUUID(), role: "user", content: question };
      const history = initial ? currentMessages : [...currentMessages, userMessage].slice(-MAX_MESSAGES);
      updateJob(project.id, { status: "conversation", detail: "Helix is thinking through the research direction before answering.", conversationThinking: true, messageId: initial ? currentMessages[0].id : userMessage.id, question });
      try {
        const answer = await answerResearchConversation({ topic: project.title, messages: history });
        const assistantMessage = { id: crypto.randomUUID(), role: "assistant", content: answer, grounded: false, conversationOnly: true, source: "research-scoping" };
        const messages = [...history, assistantMessage].slice(-MAX_MESSAGES);
        await persistConversationMessages(project.id, messages, { research_conversation_state: "exploration" });
        emit(project.id, "conversation", { messages });
        updateJob(project.id, { status: "conversation", detail: "Conversation is ready. Explore the topic, then build the research brief when you are satisfied with the direction.", conversationThinking: false, messageId: null, question: null });
        res.json({ question, answer, grounded: false, searchUsed: false, researchPending: false, messages, activity: jobSnapshot(project.id), project: projectView(project) });
        return;
      } catch (error) {
        updateJob(project.id, { status: "conversation", detail: error.code === "RESEARCH_CONVERSATION_STOPPED" ? "Generation stopped by the user." : "Conversation is ready.", conversationThinking: false, messageId: null, question: null });
        if (error.code === "RESEARCH_CONVERSATION_STOPPED") return res.status(499).json({ stopped: true, error: error.message });
        throw error;
      }
    }

    if (job?.status === "error") jobs.delete(project.id);
    const session = await loadSession(project.id);
    const result = answerResearchQuestion(session, question);
    if (!result.grounded) {
      const messageId = crypto.randomUUID();
      const jobState = ensureJob(project.id); jobState.activity = []; jobState.discoveredSources = [];
      updateJob(project.id, { status: "queued", progress: 0, detail: "The existing corpus needs more evidence for this question.", messageId, question, conversationThinking: false });
      const messages = [...getMessages(project).filter((message) => !message.optimistic), { id: messageId, role: "user", content: question }, { id: `${messageId}:assistant`, role: "assistant", content: "I don't have enough evidence in the current research corpus for that question. I’m doing a focused research pass now rather than guessing. I’ll add the new evidence to this same research memory.", researchPending: true, sources: [], evidence: [], grounded: false }].slice(-MAX_MESSAGES);
      await persistConversationMessages(project.id, messages); void runFollowUpResearch(project.id, question, messageId);
      return res.status(202).json({ question, grounded: false, searchUsed: true, researchPending: true, answer: "I don't have enough evidence in the current research corpus for that question. I’m doing a focused research pass now rather than guessing.", evidence: [], relatedClaims: [], sources: [], messages, activity: jobSnapshot(project.id), project: projectView(project) });
    }
    const messages = [...getMessages(project).filter((message) => !message.optimistic), { id: crypto.randomUUID(), role: "user", content: question }, { id: crypto.randomUUID(), role: "assistant", content: result.answer, sources: result.sources || [], evidence: result.evidence || [], grounded: true, source: "research-corpus" }].slice(-MAX_MESSAGES);
    await persistConversationMessages(project.id, messages);
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
  return { ...latest, sources: sessions.flatMap((item) => item.sources || []), evidence: sessions.flatMap((item) => item.evidence || []), claims: sessions.flatMap((item) => item.claims || []), conflicts: sessions.flatMap((item) => item.conflicts || []) };
}

export default router;
