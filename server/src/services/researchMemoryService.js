function clamp(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
}

function tokens(text = "") {
  return new Set(String(text).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((token) => token.length > 3));
}

function relevance(query, text) {
  const a = tokens(query); const b = tokens(text);
  if (!a.size || !b.size) return 0;
  let shared = 0; for (const token of a) if (b.has(token)) shared += 1;
  return shared / a.size;
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
  if (!query) return { answer: "Ask a specific question about the research corpus.", evidence: [] };
  const evidence = (session?.evidence || []).map((item) => ({ item, score: relevance(query, item.passageText) })).filter((row) => row.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
  const claims = (session?.claims || []).map((claim) => ({ claim, score: relevance(query, claim.claimText) })).filter((row) => row.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
  const topEvidence = evidence.map(({ item }) => ({ id: item.id, passageText: item.passageText, locator: item.locator, sourceId: item.sourceId, evidenceIndex: item.evidenceIndex }));
  const answer = topEvidence.length
    ? `The stored research corpus supports the following relevant evidence: ${topEvidence.map((item) => item.passageText).join(" ")}`
    : claims.length
      ? `The corpus contains these relevant claims: ${claims.map(({ claim }) => claim.claimText).join("; ")}`
      : "No sufficiently relevant evidence passage was found in the persisted corpus. Treat the question as unverified rather than filling the gap from memory.";
  return { answer, evidence: topEvidence, relatedClaims: claims.map(({ claim }) => ({ id: claim.id, claimText: claim.claimText, verificationStatus: claim.verificationStatus, verifiedConfidence: claim.verifiedConfidence })) };
}

export async function resolveResearchConflict(prisma, { conflictId, status, resolution, winningClaimId = null }) {
  if (!conflictId) throw new Error("conflictId is required");
  const nextStatus = status === "adjudicated" ? "adjudicated" : "unresolved";
  return prisma.researchConflict.update({ where: { id: conflictId }, data: { status: nextStatus, resolution: String(resolution || "Reviewed by the researcher." ).slice(0, 10000) } });
}

export function buildResearchMemory(session) {
  return {
    sessionId: session.id,
    version: session.version,
    status: session.status,
    createdAt: session.createdAt,
    completedAt: session.completedAt,
    metrics: summarizeResearchMetrics(session),
    plan: session.plan,
    sources: session.sources,
    evidence: session.evidence,
    claims: session.claims,
    conflicts: session.conflicts,
  };
}
