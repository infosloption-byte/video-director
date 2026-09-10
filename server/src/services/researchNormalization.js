function safeText(value, fallback = "") {
  if (value == null) return fallback;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => safeText(item)).filter(Boolean).join(" / ");
  if (typeof value === "object") {
    for (const key of ["text", "value", "summary", "claim", "finding", "title", "description", "explanation", "resolution", "rationale"]) {
      if (value[key] != null) {
        const text = safeText(value[key]);
        if (text) return text;
      }
    }
    if (Array.isArray(value.components)) {
      const components = value.components.map((item) => safeText(item)).filter(Boolean).join(" / ");
      if (components) return components;
    }
    try { return JSON.stringify(value); } catch { return fallback; }
  }
  return fallback;
}

export function sanitizeResearchJson(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeResearchJson(item)).filter((item) => item !== undefined);
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    const sanitized = sanitizeResearchJson(item);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

function normalizeFinding(item = {}) {
  return {
    ...item,
    claim: safeText(item.claim ?? item.finding ?? item.title),
    evidence: safeText(item.evidence ?? item.summary ?? item.description),
    evidence_level: safeText(item.evidence_level ?? item.evidenceLevel),
    source_indexes: Array.isArray(item.source_indexes) ? item.source_indexes.map(Number).filter(Number.isInteger) : [],
    evidence_indexes: Array.isArray(item.evidence_indexes) ? item.evidence_indexes.map(Number).filter(Number.isInteger) : [],
  };
}

export function normalizeResearchBrief(brief = {}) {
  const normalized = { ...brief };
  for (const key of ["executive_summary", "what_happened", "why_it_matters", "mechanism", "recommended_story_angle", "recommended_framework", "recommended_tone"]) {
    if (normalized[key] != null) normalized[key] = safeText(normalized[key]);
  }
  if (normalized.recommended_length_seconds != null) normalized.recommended_length_seconds = Number(normalized.recommended_length_seconds) || 0;
  if (Array.isArray(normalized.key_facts)) {
    normalized.key_facts = normalized.key_facts.map((fact) => {
      if (typeof fact === "string") return fact.trim();
      if (!fact || typeof fact !== "object") return "";
      return safeText(fact.claim ?? fact.finding ?? fact.title ?? fact.summary ?? fact.description);
    }).filter(Boolean);
  }
  if (Array.isArray(normalized.key_findings)) normalized.key_findings = normalized.key_findings.map(normalizeFinding);
  if (Array.isArray(normalized.important_numbers)) normalized.important_numbers = normalized.important_numbers.map((item) => ({ ...item, value: safeText(item.value), context: safeText(item.context), source_indexes: Array.isArray(item.source_indexes) ? item.source_indexes.map(Number).filter(Number.isInteger) : [] }));
  if (Array.isArray(normalized.disagreements)) normalized.disagreements = normalized.disagreements.map((item) => ({ ...item, topic: safeText(item.topic), positions: Array.isArray(item.positions) ? item.positions.map((position) => safeText(position)).filter(Boolean) : [], resolution: safeText(item.resolution), confidence: Number(item.confidence) || 0 }));
  if (Array.isArray(normalized.knowledge_gaps)) normalized.knowledge_gaps = normalized.knowledge_gaps.map((item) => safeText(item)).filter(Boolean);
  if (Array.isArray(normalized.safe_claims)) normalized.safe_claims = normalized.safe_claims.map((item) => safeText(item)).filter(Boolean);
  if (Array.isArray(normalized.claims_to_avoid)) normalized.claims_to_avoid = normalized.claims_to_avoid.map((item) => safeText(item)).filter(Boolean);
  if (Array.isArray(normalized.creative_opportunities)) normalized.creative_opportunities = normalized.creative_opportunities.map((item) => safeText(item)).filter(Boolean);
  if (normalized.reliability_assessment && typeof normalized.reliability_assessment === "object") normalized.reliability_assessment = { ...normalized.reliability_assessment, overall_score: Number(normalized.reliability_assessment.overall_score) || 0, label: safeText(normalized.reliability_assessment.label), rationale: safeText(normalized.reliability_assessment.rationale), limitations: Array.isArray(normalized.reliability_assessment.limitations) ? normalized.reliability_assessment.limitations.map((item) => safeText(item)).filter(Boolean) : [] };
  if (Array.isArray(normalized.source_assessments)) normalized.source_assessments = normalized.source_assessments.map((item) => ({ ...item, source_index: Number(item.source_index), authority: Number(item.authority) || 0, relevance: Number(item.relevance) || 0, evidence_quality: Number(item.evidence_quality) || 0, notes: safeText(item.notes) }));
  if (Array.isArray(normalized.sources)) normalized.sources = normalized.sources.map((source) => ({ ...source, title: safeText(source.title, "Source"), note: safeText(source.note), source_class: safeText(source.source_class), source_reliability: safeText(source.source_reliability), read_status: safeText(source.read_status), url: safeText(source.url) }));
  return sanitizeResearchJson(normalized);
}
