function hostname(url = "") {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function sourceAuthority(source = {}) {
  const explicit = Number(source.authority);
  if (Number.isFinite(explicit)) return clamp(explicit);
  const prior = Number(source.quality_prior);
  if (Number.isFinite(prior)) return clamp(prior);
  if (source.source_reliability === "peer_reviewed" || source.source_class === "academic") return 90;
  if (source.source_class === "government" || source.source_reliability === "primary") return 92;
  if (source.source_reliability === "trusted_news") return 82;
  return 55;
}

function sourceIndependence(source = {}) {
  const host = hostname(source.url || source.sourceUrl);
  if (!host) return 0;
  return 1;
}

function buildSourceMap(sources = []) {
  return new Map(sources.map((source, index) => [Number.isInteger(source.index) ? source.index : index, { ...source, index: Number.isInteger(source.index) ? source.index : index }]));
}

function normalizeClaim(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function claimOverlap(a, b) {
  const left = new Set(normalizeClaim(a).split(" ").filter((word) => word.length > 3));
  const right = new Set(normalizeClaim(b).split(" ").filter((word) => word.length > 3));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

function verifyFinding(finding, sourceMap, evidencePreview) {
  const requested = Array.isArray(finding?.source_indexes) ? finding.source_indexes.map(Number).filter(Number.isInteger) : [];
  const validIndexes = [...new Set(requested)].filter((index) => sourceMap.has(index));
  const invalidIndexes = requested.filter((index) => !sourceMap.has(index));
  const sources = validIndexes.map((index) => sourceMap.get(index));
  const readableSources = sources.filter((source) => source.read_status === "read" || evidencePreview.some((evidence) => evidence.source_index === source.index));
  const domains = new Set(sources.map((source) => hostname(source.url)).filter(Boolean));
  const authority = sources.length ? sources.reduce((sum, source) => sum + sourceAuthority(source), 0) / sources.length : 0;
  const corroboration = Math.min(100, readableSources.length * 30 + Math.max(0, domains.size - 1) * 15);
  const modelConfidence = clamp(finding?.confidence);
  const evidenceConfidence = validIndexes.length ? Math.round((modelConfidence * 0.45) + (authority * 0.25) + (corroboration * 0.30)) : 0;
  const traceable = validIndexes.length > 0 && readableSources.length > 0;

  return {
    claim: finding?.claim || "",
    evidence_level: finding?.evidence_level || "unverified",
    model_confidence: modelConfidence,
    verified_confidence: traceable ? evidenceConfidence : Math.min(modelConfidence, 25),
    traceable,
    source_indexes: validIndexes,
    invalid_source_indexes: [...new Set(invalidIndexes)],
    readable_source_indexes: readableSources.map((source) => source.index),
    independent_domains: domains.size,
    corroboration_score: clamp(corroboration),
    authority_score: clamp(authority),
    verification_status: !traceable ? "unverified" : readableSources.length > 1 && domains.size > 1 ? "corroborated" : "single_source",
  };
}

function detectConflicts(findings = [], disagreements = []) {
  const conflicts = [];
  for (let i = 0; i < findings.length; i += 1) {
    for (let j = i + 1; j < findings.length; j += 1) {
      const overlap = claimOverlap(findings[i]?.claim, findings[j]?.claim);
      if (overlap < 0.55) continue;
      const left = findings[i]?.evidence_level || "";
      const right = findings[j]?.evidence_level || "";
      const disagreementSignal = disagreements.some((item) => claimOverlap(item?.topic, findings[i]?.claim) >= 0.45 || claimOverlap(item?.topic, findings[j]?.claim) >= 0.45);
      if (disagreementSignal || (left === "disputed" && right !== "disputed") || (right === "disputed" && left !== "disputed")) {
        conflicts.push({ finding_indexes: [i, j], overlap: Math.round(overlap * 100), reason: "Related claims have disagreement or disputed-evidence signals." });
      }
    }
  }
  return conflicts;
}

export function verifyResearchBrief(brief = {}) {
  const sources = Array.isArray(brief.sources) ? brief.sources : [];
  const evidencePreview = Array.isArray(brief.evidence_preview) ? brief.evidence_preview : [];
  const sourceMap = buildSourceMap(sources);
  const findings = Array.isArray(brief.key_findings) ? brief.key_findings : [];
  const verifiedClaims = findings.map((finding, index) => ({ id: `claim-${index + 1}`, ...verifyFinding(finding, sourceMap, evidencePreview) }));
  const corroborated = verifiedClaims.filter((claim) => claim.verification_status === "corroborated").length;
  const unverified = verifiedClaims.filter((claim) => !claim.traceable).length;
  const conflicts = detectConflicts(findings, Array.isArray(brief.disagreements) ? brief.disagreements : []);
  const readableCount = sources.filter((source) => source.read_status === "read").length;
  const independentDomains = new Set(sources.map((source) => hostname(source.url)).filter(Boolean)).size;
  const traceability = verifiedClaims.length ? Math.round(verifiedClaims.filter((claim) => claim.traceable).length / verifiedClaims.length * 100) : 0;
  const averageConfidence = verifiedClaims.length ? Math.round(verifiedClaims.reduce((sum, claim) => sum + claim.verified_confidence, 0) / verifiedClaims.length) : 0;
  const sourceQuality = sources.length ? Math.round(sources.reduce((sum, source) => sum + sourceAuthority(source), 0) / sources.length) : 0;

  return {
    verification_version: "m17-phase2-v1",
    generated_at: new Date().toISOString(),
    summary: {
      claims_checked: verifiedClaims.length,
      claims_traceable: verifiedClaims.filter((claim) => claim.traceable).length,
      claims_corroborated: corroborated,
      claims_unverified: unverified,
      conflicts_detected: conflicts.length,
      readable_sources: readableCount,
      independent_domains: independentDomains,
      traceability_score: traceability,
      average_claim_confidence: averageConfidence,
      average_source_authority: sourceQuality,
    },
    claims: verifiedClaims,
    conflicts,
    source_quality: sources.map((source) => ({
      source_index: source.index,
      url: source.url,
      authority: sourceAuthority(source),
      readable: source.read_status === "read",
      independence: sourceIndependence(source),
      reliability_basis: source.source_reliability || source.source_class || "unknown",
    })),
    guardrails: {
      unsupported_claims_blocked: unverified,
      conflicting_evidence_surfaced: conflicts.length,
      source_authority_separate_from_claim_confidence: true,
      inaccessible_sources_treated_as_unverified: true,
    },
  };
}
