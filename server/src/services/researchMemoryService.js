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

function claimSourceLinks(claim) {
  return (claim?.sourceLinks || []).map((link) => link?.source).filter(Boolean);
}

function sourceView(source) {
  if (!source) return null;
  return { id: source.id, title: source.title || source.publisher || "Stored source", url: source.url || null, publisher: source.publisher || null, authorityScore: Number(source.authorityScore || 0), readStatus: source.readStatus || null };
}

function relatedClaimView(claim) {
  return { id: claim.id, claimText: claim.claimText, verificationStatus: claim.verificationStatus, verifiedConfidence: claim.verifiedConfidence, evidenceLevel: claim.evidenceLevel || null };
}

function strongestClaims(session) {
  const claims = Array.isArray(session?.claims) ? session.claims : [];
  return claims
    .map((claim) => {
      const sources = claimSourceLinks(claim);
      const sourceAuthority = sources.reduce((sum, source) => sum + Number(source.authorityScore || 0), 0) / Math.max(1, sources.length);
      const corroboration = Number(claim.verification?.corroborationScore || 0);
      const traceableBonus = claim.verification?.traceable ? 15 : 0;
      const confidence = Number(claim.verifiedConfidence || claim.modelConfidence || 0);
      const score = (confidence * 0.55) + (sourceAuthority * 0.2) + (corroboration * 0.2) + traceableBonus;
      return { claim, sources, score };
    })
    .filter(({ claim }) => String(claim.claimText || "").trim())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
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

export function answerResearchQuestion(session, question) {
  const query = String(question || "").trim();
  if (!query) return { grounded: false, answer: "Ask a specific question about the research corpus.", evidence: [], relatedClaims: [], searchUsed: false, sources: [] };
  const evidence = (session?.evidence || []).map((item) => ({ item, score: relevance(query, item.passageText) })).filter((row) => row.score >= 0.2).sort((a, b) => b.score - a.score).slice(0, 5);
  const claims = (session?.claims || []).map((claim) => ({ claim, score: relevance(query, claim.claimText) })).filter((row) => row.score >= 0.2).sort((a, b) => b.score - a.score).slice(0, 3);
  const topEvidence = evidence.map(({ item }) => ({ id: item.id, passageText: item.passageText, locator: item.locator, sourceId: item.sourceId, evidenceIndex: item.evidenceIndex }));
  const relatedClaims = claims.map(({ claim }) => relatedClaimView(claim));
  if (topEvidence.length) {
    const sources = [...new Map(claims.flatMap(({ claim }) => claimSourceLinks(claim).map((source) => [source.id, source])).values())].map(sourceView).filter(Boolean);
    return { grounded: true, answer: `The stored research corpus supports this answer: ${topEvidence.map((item) => item.passageText).join(" ")}`, evidence: topEvidence, relatedClaims, searchUsed: false, sources };
  }
  if (claims.length) {
    const sources = [...new Map(claims.flatMap(({ claim }) => claimSourceLinks(claim).map((source) => [source.id, source])).values())].map(sourceView).filter(Boolean);
    return { grounded: true, answer: `The corpus contains these relevant research claims: ${claims.map(({ claim }) => claim.claimText).join("; ")}`, evidence: [], relatedClaims, searchUsed: false, sources };
  }
  const sourceMatches = (session?.sources || [])
    .map((source) => ({ source, score: relevance(query, `${source.title || ""} ${source.publisher || ""} ${source.readExcerpt || ""}`) }))
    .filter((row) => row.score >= 0.2 && row.source.readExcerpt)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  if (sourceMatches.length) {
    return {
      grounded: true,
      answer: `The stored research includes relevant source notes: ${sourceMatches.map(({ source }) => source.readExcerpt).join(" ")}`,
      evidence: [],
      relatedClaims: [],
      searchUsed: false,
      sources: sourceMatches.map(({ source }) => sourceView(source)).filter(Boolean),
    };
  }
  return { grounded: false, answer: "No sufficiently relevant evidence was found in the stored research corpus. Helix did not perform a web search for this follow-up.", evidence: [], relatedClaims: [], searchUsed: false, sources: [] };
}

export function buildStrengthAnswer(session) {
  const ranked = strongestClaims(session);
  const evidence = (session?.evidence || []).map((item) => {
    const source = session?.sources?.find((candidate) => candidate.id === item.sourceId);
    return { item, source, score: (Number(source?.authorityScore || 0) * 0.7) + relevance("strongest evidence", item.passageText) * 30 };
  }).sort((a, b) => b.score - a.score).slice(0, 5);

  if (evidence.length) {
    const top = evidence.slice(0, 3).map(({ item, source }, index) => `${index + 1}. ${item.passageText}${source?.title ? ` — ${source.title}` : ""}`).join("\n");
    return {
      grounded: true,
      answer: `The strongest stored evidence is the source-backed material with the highest combined source authority and evidence relevance.\n\n${top}`,
      evidence: evidence.slice(0, 5).map(({ item }) => ({ id: item.id, passageText: item.passageText, locator: item.locator, sourceId: item.sourceId, evidenceIndex: item.evidenceIndex })),
      relatedClaims: ranked.slice(0, 3).map(({ claim }) => relatedClaimView(claim)),
      searchUsed: false,
      sources: [...new Map(evidence.map(({ source }) => source).filter(Boolean).map((source) => [source.id, source])).values()].map(sourceView).filter(Boolean),
    };
  }

  if (ranked.length) {
    const top = ranked.slice(0, 3).map(({ claim, sources }, index) => {
      const attribution = sources.length ? ` — ${sources[0].title || sources[0].publisher || "stored source"}` : "";
      const confidence = Number(claim.verifiedConfidence || claim.modelConfidence || 0);
      const status = claim.verificationStatus || "unverified";
      return `${index + 1}. ${claim.claimText}${attribution} (${status}, confidence ${Math.round(confidence)}%)`;
    }).join("\n");
    return {
      grounded: true,
      answer: `This session has no discrete evidence-passage records, but it does contain verified research claims. The strongest stored support is:\n\n${top}`,
      evidence: [],
      relatedClaims: ranked.slice(0, 5).map(({ claim }) => relatedClaimView(claim)),
      searchUsed: false,
      sources: [...new Map(ranked.flatMap(({ sources }) => sources).map((source) => [source.id, source])).values()].map(sourceView).filter(Boolean),
    };
  }

  const readableSources = (session?.sources || []).filter((source) => source.readStatus === "read" && source.readExcerpt);
  if (readableSources.length) {
    const top = readableSources.slice(0, 3).map((source, index) => `${index + 1}. ${source.readExcerpt}`).join("\n");
    return {
      grounded: true,
      answer: `The stored session has readable source notes but no discrete evidence records yet. The available source material is:\n\n${top}`,
      evidence: [],
      relatedClaims: [],
      searchUsed: false,
      sources: readableSources.slice(0, 5).map(sourceView).filter(Boolean),
    };
  }

  return { grounded: false, answer: "The stored research session has no evidence passages, claims, or readable source notes available for this question. Run a new research session to build a complete evidence-backed corpus.", evidence: [], relatedClaims: [], searchUsed: false, sources: [] };
}

export async function revalidateStoredBrief(storedBrief) {
  const brief = storedBrief && typeof storedBrief === "object" ? storedBrief : {};
  const verification = verifyResearchBrief(brief);
  const adjudication = await adjudicateResearchConflicts({ ...brief, verification });
  return { ...brief, verification: { ...verification, conflicts: adjudication.conflicts, summary: { ...verification.summary, conflicts_detected: adjudication.conflicts.length, conflicts_adjudicated: adjudication.summary.conflictsAdjudicated, conflicts_unresolved: adjudication.summary.conflictsUnresolved, adjudication_model_assisted: adjudication.summary.modelAssisted, adjudication_model_error: adjudication.summary.modelError } }, adjudication, research_metrics: { ...(brief.research_metrics || {}), claims_checked: verification.summary.claims_checked, claims_traceable: verification.summary.claims_traceable, claims_corroborated: verification.summary.claims_corroborated, conflicts_detected: adjudication.conflicts.length, conflicts_adjudicated: adjudication.summary.conflictsAdjudicated, conflicts_unresolved: adjudication.summary.conflictsUnresolved } };
}

export function resolveResearchConflict(prisma, { conflictId, status, resolution }) {
  if (!conflictId) throw new Error("conflictId is required");
  const nextStatus = status === "adjudicated" ? "adjudicated" : "unresolved";
  return prisma.researchConflict.update({ where: { id: conflictId }, data: { status: nextStatus, resolution: String(resolution || "Reviewed by the researcher.").slice(0, 10000) } });
}

export function buildResearchMemory(session) {
  return { sessionId: session.id, version: session.version, status: session.status, createdAt: session.createdAt, completedAt: session.completedAt, metrics: summarizeResearchMetrics(session), plan: session.plan, sources: session.sources, evidence: session.evidence, claims: session.claims, conflicts: session.conflicts };
}
