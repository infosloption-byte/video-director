import { prisma } from "../db/client.js";

function clamp(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : fallback;
}

function publicSource(source) {
  return {
    index: source.sourceIndex,
    id: source.id,
    url: source.url,
    canonical_url: source.canonicalUrl,
    title: source.title,
    publisher: source.publisher,
    source_class: source.sourceClass,
    reliability: source.reliability,
    published_at: source.publishedAt,
    retrieved_at: source.retrievedAt,
    read_status: source.readStatus,
    read_excerpt: source.readExcerpt,
    authority: clamp(source.authorityScore),
    relevance: clamp(source.relevanceScore),
    evidence_quality: clamp(source.evidenceScore),
    recency: clamp(source.recencyScore),
    independence: clamp(source.independenceScore),
    transparency: clamp(source.transparencyScore),
  };
}

function publicEvidence(evidence, sourceIndexById) {
  return {
    index: evidence.evidenceIndex,
    id: evidence.id,
    source_index: sourceIndexById.get(evidence.sourceId) ?? null,
    passage: evidence.passageText,
    start_offset: evidence.startOffset,
    end_offset: evidence.endOffset,
    locator: evidence.locator,
    evidence_type: evidence.evidenceType,
  };
}

export async function loadResearchCorpus(projectId) {
  if (!projectId) return null;
  const session = await prisma.researchSession.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: {
      plan: true,
      sources: { orderBy: { sourceIndex: "asc" } },
      evidence: { orderBy: { evidenceIndex: "asc" } },
      claims: {
        orderBy: { claimIndex: "asc" },
        include: {
          verification: true,
          sourceLinks: { include: { source: true } },
          evidenceLinks: { include: { evidence: true } },
        },
      },
      conflicts: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!session) return null;

  const sourceIndexById = new Map(session.sources.map((source) => [source.id, source.sourceIndex]));
  return {
    session: {
      id: session.id,
      version: session.version,
      status: session.status,
      started_at: session.startedAt,
      completed_at: session.completedAt,
    },
    plan: session.plan
      ? {
          lanes: session.plan.lanes,
          queries_planned: session.plan.queriesPlanned,
          queries_run: session.plan.queriesRun,
        }
      : null,
    sources: session.sources.map(publicSource),
    evidence: session.evidence.map((item) => publicEvidence(item, sourceIndexById)),
    claims: session.claims.map((claim) => ({
      index: claim.claimIndex,
      id: claim.id,
      claim: claim.claimText,
      evidence_level: claim.evidenceLevel,
      model_confidence: clamp(claim.modelConfidence),
      verified_confidence: clamp(claim.verifiedConfidence),
      verification_status: claim.verificationStatus,
      source_indexes: claim.sourceLinks.map((link) => link.source?.sourceIndex).filter(Number.isInteger),
      evidence_indexes: claim.evidenceLinks.map((link) => link.evidence?.evidenceIndex).filter(Number.isInteger),
      verification: claim.verification
        ? {
            corroboration_score: clamp(claim.verification.corroborationScore),
            contradiction_score: clamp(claim.verification.contradictionScore),
            authority_score: clamp(claim.verification.authorityScore),
            relevance_score: clamp(claim.verification.relevanceScore),
            evidence_quality_score: clamp(claim.verification.evidenceQualityScore),
            recency_score: clamp(claim.verification.recencyScore),
            independence_score: clamp(claim.verification.independenceScore),
            transparency_score: clamp(claim.verification.transparencyScore),
            traceable: Boolean(claim.verification.traceable),
            notes: claim.verification.notes,
          }
        : null,
    })),
    conflicts: session.conflicts.map((conflict) => ({
      id: conflict.id,
      left_claim_index: session.claims.find((claim) => claim.id === conflict.leftClaimId)?.claimIndex ?? null,
      right_claim_index: session.claims.find((claim) => claim.id === conflict.rightClaimId)?.claimIndex ?? null,
      overlap_score: clamp(conflict.overlapScore),
      reason: conflict.reason,
      resolution: conflict.resolution,
      status: conflict.status,
    })),
  };
}

export function compactResearchCorpus(corpus, { maxSources = 20, maxEvidence = 30, maxClaims = 15 } = {}) {
  if (!corpus) return null;
  return {
    session: corpus.session,
    sources: corpus.sources.slice(0, maxSources).map((source) => ({
      index: source.index,
      title: source.title,
      publisher: source.publisher,
      source_class: source.source_class,
      read_status: source.read_status,
      url: source.url,
      reliability: source.reliability,
      authority: source.authority,
      relevance: source.relevance,
      evidence_quality: source.evidence_quality,
    })),
    evidence: corpus.evidence.slice(0, maxEvidence),
    claims: corpus.claims.slice(0, maxClaims),
    conflicts: corpus.conflicts,
  };
}
