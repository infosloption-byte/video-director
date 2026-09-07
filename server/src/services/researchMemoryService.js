import { verifyResearchBrief } from "./researchVerificationService.js";
import { adjudicateResearchConflicts } from "./researchAdjudicationService.js";

function tokens(text = "") {
  return new Set(String(text).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((token) => token.length > 3));
}

function relevance(query, text) {
  const a = tokens(query); const b = tokens(text);
  if (!a.size || !b.size) return 0;
  let shared = 0; for (const token of a) if (b.has(token)) shared += 1;
  return shared / a.size;
}

function extractGeminiText(data) {
  return (data?.candidates || []).flatMap((candidate) => candidate?.content?.parts || []).map((part) => part?.text || "").join(" ").trim();
}

function extractGroundingSources(data) {
  return (data?.candidates || []).flatMap((candidate) => candidate?.groundingMetadata?.groundingChunks || []).map((chunk) => chunk?.web).filter((web) => web?.uri).map((web) => ({ title: web.title || web.uri, url: web.uri }));
}

async function answerWithGeminiSearch(session, question) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { grounded: false, answer: "No sufficiently relevant evidence was found in the stored research corpus, and web search is not configured for this Helix workspace.", evidence: [], relatedClaims: [], searchUsed: false, sources: [] };
  const model = String(process.env.GEMINI_FOLLOWUP_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash").replace(/^models\//, "");
  const corpus = {
    claims: (session?.claims || []).slice(0, 40).map((claim) => ({ claim: claim.claimText, verification: claim.verificationStatus, confidence: claim.verifiedConfidence })),
    evidence: (session?.evidence || []).slice(0, 80).map((item) => ({ passage: item.passageText, locator: item.locator, evidenceIndex: item.evidenceIndex })),
    sources: (session?.sources || []).slice(0, 40).map((source) => ({ title: source.title, url: source.url, readStatus: source.readStatus, authority: source.authorityScore }))
  };
  const prompt = `You are Helix Research Assistant. A research run has already been completed. Answer the user's question using the persisted research corpus below as the primary source. The application only invokes you for this question when its local evidence matcher could not find a sufficiently relevant answer, so you may use Google Search to fill the gap. Clearly distinguish persisted research from newly searched information. Do not invent facts or citations. Give a useful, concise but sufficiently detailed answer for a video researcher.\n\nUSER QUESTION:\n${question}\n\nPERSISTED RESEARCH CORPUS:\n${JSON.stringify(corpus)}`;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.2, maxOutputTokens: 1400 } }),
      signal: AbortSignal.timeout(45000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `Gemini request failed with HTTP ${response.status}.`);
    const answer = extractGeminiText(data);
    if (!answer) throw new Error("Gemini returned an empty answer.");
    return { grounded: true, answer, evidence: [], relatedClaims: [], searchUsed: true, sources: extractGroundingSources(data) };
  } catch (error) {
    return { grounded: false, answer: `No sufficiently relevant evidence was found in the stored research corpus. Web search could not complete: ${error.message || "unknown search error"}`, evidence: [], relatedClaims: [], searchUsed: true, sources: [] };
  }
}

export function summarizeResearchMetrics(session) {
  const sources = session?.sources || [];
  const evidence = session?.evidence || [];
  const claims = session?.claims || [];
  const conflicts = session?.conflicts || [];
  const readable = sources.filter((source) => source.readStatus === "read").length;
  const traceable = claims.filter((claim) => claim.verification?.traceable).length;
  const corroborated = claims.filter((claim) => claim.verificationStatus === "corroborated").length;
  const authority = sources.length ? Math.round(sources.reduce((sum, source) => sum + Number(source.authorityScore || 0), 0) / sources.length) : 0;
  const confidence = claims.length ? Math.round(claims.reduce((sum, claim) => sum + Number(claim.verifiedConfidence || 0), 0) / claims.length) : 0;
  return { version: session?.version || 1, sources: sources.length, readableSources: readable, unreadableSources: Math.max(0, sources.length - readable), evidencePassages: evidence.length, claims: claims.length, traceableClaims: traceable, corroboratedClaims: corroborated, conflicts: conflicts.length, unresolvedConflicts: conflicts.filter((item) => item.status !== "adjudicated").length, averageAuthority: authority, averageVerifiedConfidence: confidence };
}

export async function answerResearchQuestion(session, question) {
  const query = String(question || "").trim();
  if (!query) return { grounded: false, answer: "Ask a specific question about the research corpus.", evidence: [], relatedClaims: [], searchUsed: false, sources: [] };
  const evidence = (session?.evidence || []).map((item) => ({ item, score: relevance(query, item.passageText) })).filter((row) => row.score >= 0.2).sort((a, b) => b.score - a.score).slice(0, 5);
  const claims = (session?.claims || []).map((claim) => ({ claim, score: relevance(query, claim.claimText) })).filter((row) => row.score >= 0.2).sort((a, b) => b.score - a.score).slice(0, 3);
  const topEvidence = evidence.map(({ item }) => ({ id: item.id, passageText: item.passageText, locator: item.locator, sourceId: item.sourceId, evidenceIndex: item.evidenceIndex }));
  if (topEvidence.length) return { grounded: true, answer: `The stored research corpus supports this answer: ${topEvidence.map((item) => item.passageText).join(" ")}`, evidence: topEvidence, relatedClaims: claims.map(({ claim }) => ({ id: claim.id, claimText: claim.claimText, verificationStatus: claim.verificationStatus, verifiedConfidence: claim.verifiedConfidence })), searchUsed: false, sources: [] };
  if (claims.length) return { grounded: true, answer: `The corpus contains these relevant verified research claims: ${claims.map(({ claim }) => claim.claimText).join("; ")}`, evidence: [], relatedClaims: claims.map(({ claim }) => ({ id: claim.id, claimText: claim.claimText, verificationStatus: claim.verificationStatus, verifiedConfidence: claim.verifiedConfidence })), searchUsed: false, sources: [] };
  return answerWithGeminiSearch(session, query);
}

export async function revalidateStoredBrief(storedBrief) {
  const brief = storedBrief && typeof storedBrief === "object" ? storedBrief : {};
  const verification = verifyResearchBrief(brief);
  const adjudication = await adjudicateResearchConflicts({ ...brief, verification });
  return { ...brief, verification: { ...verification, conflicts: adjudication.conflicts, summary: { ...verification.summary, conflicts_detected: adjudication.conflicts.length, conflicts_adjudicated: adjudication.summary.conflictsAdjudicated, conflicts_unresolved: adjudication.summary.conflictsUnresolved, adjudication_model_assisted: adjudication.summary.modelAssisted, adjudication_model_error: adjudication.summary.modelError } }, adjudication, research_metrics: { ...(brief.research_metrics || {}), claims_checked: verification.summary.claims_checked, claims_traceable: verification.summary.claims_traceable, claims_corroborated: verification.summary.claims_corroborated, conflicts_detected: adjudication.conflicts.length, conflicts_adjudicated: adjudication.summary.conflictsAdjudicated, conflicts_unresolved: adjudication.summary.conflictsUnresolved } };
}

export async function resolveResearchConflict(prisma, { conflictId, status, resolution }) {
  if (!conflictId) throw new Error("conflictId is required");
  const nextStatus = status === "adjudicated" ? "adjudicated" : "unresolved";
  return prisma.researchConflict.update({ where: { id: conflictId }, data: { status: nextStatus, resolution: String(resolution || "Reviewed by the researcher.").slice(0, 10000) } });
}

export function buildResearchMemory(session) {
  return { sessionId: session.id, version: session.version, status: session.status, createdAt: session.createdAt, completedAt: session.completedAt, metrics: summarizeResearchMetrics(session), plan: session.plan, sources: session.sources, evidence: session.evidence, claims: session.claims, conflicts: session.conflicts };
}
