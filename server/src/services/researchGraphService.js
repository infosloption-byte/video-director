import crypto from "node:crypto";
import { prisma } from "../db/client.js";

function clamp(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hashContent(value) {
  if (!value) return null;
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function sourcePublisher(source = {}) {
  return source.publisher || source.source_name || source.sourceName || null;
}

function sourceUrl(source = {}) {
  return source.url || source.sourceUrl || null;
}

function scoreSource(source, quality = {}) {
  const authority = clamp(quality.authority ?? source.authority ?? source.quality_prior, 0);
  const relevance = clamp(quality.relevance ?? source.relevance, authority || 0);
  const evidence = clamp(quality.evidence ?? (source.read_status === "read" ? 80 : 15), 0);
  const recency = clamp(quality.recency ?? (source.published_at || source.publishedAt ? 75 : 35), 0);
  const independence = clamp(quality.independence ?? 50, 0);
  const transparency = clamp(quality.transparency ?? (source.read_status === "read" ? 75 : 25), 0);
  return { authority, relevance, evidence, recency, independence, transparency };
}

function buildEvidence(brief, sourceRecords) {
  const previews = Array.isArray(brief.evidence_preview) ? brief.evidence_preview : [];
  const byIndex = new Map(sourceRecords.map((source) => [source.sourceIndex, source]));
  const rows = [];
  previews.forEach((preview, index) => {
    const sourceIndex = Number(preview.source_index ?? preview.sourceIndex);
    const source = byIndex.get(sourceIndex);
    const passage = String(preview.excerpt || preview.passage || preview.text || "").trim();
    if (!source || !passage) return;
    rows.push({
      sessionId: source.sessionId,
      sourceId: source.id,
      evidenceIndex: index,
      passageText: passage,
      startOffset: Number.isInteger(preview.start_offset) ? preview.start_offset : null,
      endOffset: Number.isInteger(preview.end_offset) ? preview.end_offset : null,
      locator: preview.locator ? String(preview.locator).slice(0, 255) : null,
      evidenceType: preview.evidence_type || "source_excerpt",
    });
  });
  return rows;
}

export async function persistResearchGraph(projectId, brief, { status = "completed" } = {}) {
  if (!projectId || !brief) return null;
  const verification = brief.verification || {};
  const sources = Array.isArray(brief.sources) ? brief.sources : [];
  const verifiedClaims = Array.isArray(verification.claims) ? verification.claims : [];
  const findings = Array.isArray(brief.key_findings) ? brief.key_findings : [];
  const claims = verifiedClaims.length ? verifiedClaims : findings.map((finding, index) => ({
    id: `claim-${index + 1}`,
    claim: finding.claim,
    evidence_level: finding.evidence_level,
    model_confidence: finding.confidence,
    verified_confidence: finding.confidence,
    verification_status: "unverified",
    source_indexes: finding.source_indexes || [],
  }));

  const session = await prisma.researchSession.create({
    data: {
      projectId,
      version: 1,
      status,
      completedAt: status === "completed" ? new Date() : null,
    },
  });

  const lanes = brief.research_plan || brief.plan || brief.research_lanes || [];
  await prisma.researchPlan.create({
    data: {
      sessionId: session.id,
      lanes: lanes || [],
      queriesPlanned: Array.isArray(lanes) ? lanes.length : Number(brief.research_metrics?.queries_planned || 0),
      queriesRun: Number(brief.research_metrics?.queries_run || brief.research_metrics?.searches_run || 0),
    },
  });

  const qualityByIndex = new Map((Array.isArray(verification.source_quality) ? verification.source_quality : []).map((item) => [Number(item.source_index), item]));
  const sourceRecords = [];
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index] || {};
    const sourceIndex = Number.isInteger(source.index) ? source.index : index;
    const url = sourceUrl(source);
    if (!url) continue;
    const quality = qualityByIndex.get(sourceIndex) || {};
    const scores = scoreSource(source, quality);
    const excerpt = source.read_excerpt || source.readExcerpt || null;
    const record = await prisma.researchSource.create({
      data: {
        sessionId: session.id,
        sourceIndex,
        url: String(url),
        canonicalUrl: source.canonical_url || source.canonicalUrl || null,
        title: source.title || null,
        publisher: sourcePublisher(source),
        sourceClass: source.source_class || source.sourceClass || null,
        reliability: source.source_reliability || source.reliability || null,
        publishedAt: parseDate(source.published_at || source.publishedAt),
        retrievedAt: parseDate(source.retrieved_at || source.retrievedAt) || new Date(),
        readStatus: source.read_status || source.readStatus || "unread",
        readExcerpt: excerpt ? String(excerpt).slice(0, 12000) : null,
        contentHash: hashContent(source.read_content || source.content || excerpt),
        authorityScore: scores.authority,
        relevanceScore: scores.relevance,
        evidenceScore: scores.evidence,
        recencyScore: scores.recency,
        independenceScore: scores.independence,
        transparencyScore: scores.transparency,
      },
    });
    sourceRecords.push(record);
  }

  const evidenceRows = buildEvidence(brief, sourceRecords);
  const evidenceRecords = [];
  for (const row of evidenceRows) evidenceRecords.push(await prisma.researchEvidence.create({ data: row }));

  const sourceByIndex = new Map(sourceRecords.map((source) => [source.sourceIndex, source]));
  const evidenceByIndex = new Map(evidenceRecords.map((evidence) => [evidence.evidenceIndex, evidence]));
  const claimRecords = [];
  for (let index = 0; index < claims.length; index += 1) {
    const claim = claims[index] || {};
    const record = await prisma.researchClaim.create({
      data: {
        sessionId: session.id,
        claimIndex: index,
        claimText: String(claim.claim || claim.claimText || "").trim(),
        evidenceLevel: claim.evidence_level || claim.evidenceLevel || null,
        modelConfidence: clamp(claim.model_confidence ?? claim.confidence, 0),
        verifiedConfidence: clamp(claim.verified_confidence ?? claim.confidence, 0),
        verificationStatus: claim.verification_status || "unverified",
      },
    });
    claimRecords.push(record);

    const sourceIndexes = Array.isArray(claim.source_indexes) ? claim.source_indexes : [];
    for (const sourceIndex of [...new Set(sourceIndexes.map(Number).filter(Number.isInteger))]) {
      const source = sourceByIndex.get(sourceIndex);
      if (source) await prisma.researchClaimSource.create({ data: { claimId: record.id, sourceId: source.id } });
    }

    const evidenceIndexes = Array.isArray(claim.evidence_indexes) ? claim.evidence_indexes : [];
    for (const evidenceIndex of [...new Set(evidenceIndexes.map(Number).filter(Number.isInteger))]) {
      const evidence = evidenceByIndex.get(evidenceIndex);
      if (evidence) await prisma.researchClaimEvidence.create({ data: { claimId: record.id, evidenceId: evidence.id } });
    }

    const sourceIndexesForFallback = sourceIndexes.map(Number).filter(Number.isInteger);
    if (!evidenceIndexes.length && sourceIndexesForFallback.length) {
      const matchingEvidence = evidenceRecords.filter((evidence) => sourceIndexesForFallback.includes(sourceRecords.find((source) => source.id === evidence.sourceId)?.sourceIndex));
      for (const evidence of matchingEvidence) await prisma.researchClaimEvidence.create({ data: { claimId: record.id, evidenceId: evidence.id } }).catch(() => {});
    }

    const sourceQuality = sourceIndexesForFallback.map((sourceIndex) => qualityByIndex.get(sourceIndex)).filter(Boolean);
    const authority = sourceQuality.length ? sourceQuality.reduce((sum, item) => sum + clamp(item.authority), 0) / sourceQuality.length : 0;
    const claimContradiction = (verification.conflicts || []).some((conflict) => Array.isArray(conflict.finding_indexes) && conflict.finding_indexes.includes(index)) ? 70 : 0;
    const claimVerification = verification.claims?.[index] || {};
    await prisma.researchVerification.create({
      data: {
        claimId: record.id,
        corroborationScore: clamp(claimVerification.corroboration_score),
        contradictionScore: claimContradiction,
        authorityScore: clamp(claimVerification.authority_score ?? authority),
        relevanceScore: sourceQuality.length ? clamp(sourceQuality.reduce((sum, item) => sum + clamp(item.relevance), 0) / sourceQuality.length) : 0,
        evidenceQualityScore: sourceQuality.length ? clamp(sourceQuality.reduce((sum, item) => sum + clamp(item.evidence_quality ?? item.evidence), 0) / sourceQuality.length) : 0,
        recencyScore: sourceQuality.length ? clamp(sourceQuality.reduce((sum, item) => sum + clamp(item.recency), 0) / sourceQuality.length) : 0,
        independenceScore: clamp(claimVerification.independent_domains ? Math.min(100, claimVerification.independent_domains * 50) : 0),
        transparencyScore: sourceQuality.length ? clamp(sourceQuality.reduce((sum, item) => sum + clamp(item.transparency), 0) / sourceQuality.length) : 0,
        traceable: Boolean(claimVerification.traceable),
        notes: claimVerification.verification_status || null,
      },
    });
  }

  const conflicts = Array.isArray(verification.conflicts) ? verification.conflicts : [];
  for (const conflict of conflicts) {
    const [leftIndex, rightIndex] = Array.isArray(conflict.finding_indexes) ? conflict.finding_indexes : [];
    const leftClaim = claimRecords[leftIndex];
    const rightClaim = claimRecords[rightIndex];
    if (!leftClaim || !rightClaim || leftClaim.id === rightClaim.id) continue;
    await prisma.researchConflict.create({
      data: {
        sessionId: session.id,
        leftClaimId: leftClaim.id,
        rightClaimId: rightClaim.id,
        overlapScore: clamp(conflict.overlap),
        reason: String(conflict.reason || "Conflicting evidence detected."),
        status: "open",
      },
    });
  }

  return prisma.researchSession.findUnique({
    where: { id: session.id },
    include: {
      plan: true,
      sources: { orderBy: { sourceIndex: "asc" } },
      evidence: { orderBy: { evidenceIndex: "asc" } },
      claims: { orderBy: { claimIndex: "asc" }, include: { verification: true, sourceLinks: { include: { source: true } }, evidenceLinks: { include: { evidence: true } } } },
      conflicts: true,
    },
  });
}
