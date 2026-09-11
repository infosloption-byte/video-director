const MIN_FINDINGS = 8;
const MAX_FINDINGS = 12;
const REPAIR_SOURCE_LIMIT = 8;
const REPAIR_SOURCE_CHARS = 4200;
const REPAIR_TIMEOUT_MS = 90000;
const FALLBACK_SENTENCE_MIN = 80;
const FALLBACK_SENTENCE_MAX = 360;

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "because", "being", "between", "could", "from", "have", "into", "more", "most",
  "other", "over", "such", "than", "that", "their", "there", "these", "they", "this", "through", "were", "which", "with",
  "would", "your", "what", "where", "when", "while", "into", "using", "used", "than", "then", "only", "some", "many",
]);

function clamp(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function text(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function tokens(value = "") {
  return new Set(text(value).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((token) => token.length > 3 && !STOP_WORDS.has(token)));
}

function overlap(left = "", right = "") {
  const a = tokens(left); const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / Math.max(1, Math.min(a.size, b.size));
}

function sourceIndexSet(sourceCount) {
  return new Set(Array.from({ length: sourceCount }, (_, index) => index));
}

function normalizeSourceIndexes(value, sourceCount) {
  const valid = sourceIndexSet(sourceCount);
  return [...new Set((Array.isArray(value) ? value : []).map(Number).filter((index) => Number.isInteger(index) && valid.has(index)))];
}

function isUsableFinding(finding, sourceCount) {
  const claim = text(finding?.claim ?? finding?.finding ?? finding?.title);
  const evidence = text(finding?.evidence ?? finding?.summary ?? finding?.description);
  const indexes = normalizeSourceIndexes(finding?.source_indexes, sourceCount);
  return Boolean(claim && evidence && indexes.length);
}

function normalizeFinding(finding, sourceCount, fallbackEvidence = "") {
  const claim = text(finding?.claim ?? finding?.finding ?? finding?.title);
  const evidence = text(finding?.evidence ?? finding?.summary ?? finding?.description) || fallbackEvidence;
  const sourceIndexes = normalizeSourceIndexes(finding?.source_indexes, sourceCount);
  const confidence = clamp(finding?.confidence, 0, 100);
  const allowedLevels = new Set(["established", "strong", "mixed", "limited", "unverified", "disputed"]);
  const level = allowedLevels.has(String(finding?.evidence_level || "").toLowerCase()) ? String(finding.evidence_level).toLowerCase() : confidence >= 85 ? "strong" : confidence >= 65 ? "mixed" : "limited";
  return {
    claim,
    evidence,
    confidence,
    evidence_level: level,
    source_indexes: sourceIndexes,
    evidence_indexes: Array.isArray(finding?.evidence_indexes) ? finding.evidence_indexes.map(Number).filter(Number.isInteger) : [],
  };
}

function contentSentences(source) {
  const body = text(source?.content || source?.description || "");
  if (!body) return [];
  return body.match(/[^.!?]+(?:[.!?](?=\s|$)|$)/g)?.map(text).filter((sentence) => sentence.length >= FALLBACK_SENTENCE_MIN && sentence.length <= FALLBACK_SENTENCE_MAX) || [];
}

function deterministicFindings(topic, sources) {
  const topicTerms = tokens(topic);
  const candidates = [];
  sources.forEach((source, sourceIndex) => {
    for (const sentence of contentSentences(source)) {
      const topicScore = topicTerms.size ? [...topicTerms].filter((term) => tokens(sentence).has(term)).length / topicTerms.size : 0;
      const signalScore = /\b(show|shows|found|finds|found that|suggests?|associated|linked|measured|reported|observed|demonstrat|evidence|data|study|analysis|result|increase|decrease|significant|estimate|percent|million|billion|year|between)\b/i.test(sentence) ? 0.25 : 0;
      const sourceScore = clamp(source?.quality_prior, 45, 100) / 100;
      const score = (topicScore * 0.45) + (signalScore * 0.2) + (sourceScore * 0.35);
      candidates.push({ sentence, sourceIndex, title: text(source?.title) || "Source", score });
    }
  });
  candidates.sort((a, b) => b.score - a.score || a.sourceIndex - b.sourceIndex);
  const selected = [];
  const used = new Set();
  for (const candidate of candidates) {
    if (selected.length >= MIN_FINDINGS) break;
    const key = candidate.sentence.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    selected.push(candidate);
  }
  return selected.map((candidate) => ({
    claim: candidate.sentence,
    evidence: `The readable source states: ${candidate.sentence}`,
    confidence: clamp(candidate.score * 100, 55, 88),
    evidence_level: candidate.score >= 0.78 ? "strong" : candidate.score >= 0.6 ? "mixed" : "limited",
    source_indexes: [candidate.sourceIndex],
  }));
}

function buildTakeaways(findings, evidencePreview = []) {
  const previews = Array.isArray(evidencePreview) ? evidencePreview : [];
  return findings.slice(0, 8).map((finding, index) => {
    const evidenceIndexes = Array.isArray(finding.evidence_indexes) ? finding.evidence_indexes : [];
    const linked = evidenceIndexes.map((evidenceIndex) => previews[evidenceIndex]).filter(Boolean).slice(0, 3);
    const sourceIndexes = normalizeSourceIndexes(finding.source_indexes, Math.max(0, Math.max(...findings.flatMap((item) => item.source_indexes || []), -1) + 1));
    return {
      id: `takeaway-${index + 1}`,
      takeaway: finding.claim,
      support: finding.evidence,
      confidence: clamp(finding.confidence),
      evidence_level: finding.evidence_level,
      source_indexes: sourceIndexes,
      evidence_indexes: evidenceIndexes.slice(0, 3),
      supporting_passages: linked.map((item) => ({ source_index: Number(item.source_index), title: text(item.title), excerpt: text(item.excerpt), locator: text(item.locator) })),
    };
  });
}

function buildSynthesisSections(brief, findings, takeaways, topic) {
  const existing = [
    ["What happened", brief.what_happened],
    ["Why it matters", brief.why_it_matters],
    ["How it works", brief.mechanism],
  ].filter(([, value]) => text(value));

  const sections = existing.map(([heading, body]) => ({ heading, body: text(body), source_indexes: [...new Set(findings.flatMap((item) => item.source_indexes || []))].slice(0, 6) }));
  if (!sections.length) {
    const lead = takeaways.slice(0, 4).map((item) => item.takeaway).join(" ");
    sections.push({ heading: "Research synthesis", body: lead || `The completed research examined ${topic} across the available readable sources.`, source_indexes: [...new Set(findings.flatMap((item) => item.source_indexes || []))].slice(0, 6) });
  }
  sections.push({
    heading: "Evidence pattern",
    body: takeaways.length
      ? `${takeaways.length} high-value takeaways were linked to stored research evidence. The strongest support comes from the findings with the highest confidence and most authoritative readable sources.`
      : "No evidence-backed takeaways were available from the stored corpus.",
    source_indexes: [...new Set(takeaways.flatMap((item) => item.source_indexes || []))].slice(0, 6),
  });
  const gaps = Array.isArray(brief.knowledge_gaps) ? brief.knowledge_gaps.filter(text) : [];
  if (gaps.length) sections.push({ heading: "What remains uncertain", body: gaps.join(" "), source_indexes: [] });
  return sections.slice(0, 6);
}

function buildBottomLine(brief, findings, takeaways) {
  const existing = text(brief.bottom_line);
  if (existing) return existing;
  if (takeaways.length) {
    const primary = takeaways.slice(0, 3).map((item) => item.takeaway).join(" ");
    const caution = Array.isArray(brief.knowledge_gaps) && brief.knowledge_gaps.length ? ` The report should retain these uncertainties: ${brief.knowledge_gaps.slice(0, 2).map(text).filter(Boolean).join(" ")}` : "";
    return `${primary}${caution}`.trim();
  }
  if (findings.length) return findings.slice(0, 2).map((item) => item.claim).join(" ");
  return text(brief.executive_summary) || "The research brief is complete, but the stored corpus did not yield a reliable structured conclusion.";
}

const REPAIR_SCHEMA = {
  type: "object",
  properties: {
    executive_summary: { type: "string" },
    what_happened: { type: "string" },
    why_it_matters: { type: "string" },
    mechanism: { type: "string" },
    key_findings: {
      type: "array", minItems: MIN_FINDINGS, maxItems: MAX_FINDINGS,
      items: {
        type: "object",
        properties: {
          claim: { type: "string" }, evidence: { type: "string" }, confidence: { type: "integer", minimum: 0, maximum: 100 },
          evidence_level: { type: "string", enum: ["established", "strong", "mixed", "limited", "unverified", "disputed"] },
          source_indexes: { type: "array", minItems: 1, items: { type: "integer" } },
        },
        required: ["claim", "evidence", "confidence", "evidence_level", "source_indexes"],
      },
    },
    important_numbers: { type: "array", maxItems: 12, items: { type: "object", properties: { value: { type: "string" }, context: { type: "string" }, source_indexes: { type: "array", items: { type: "integer" } } }, required: ["value", "context", "source_indexes"] } },
    disagreements: { type: "array", maxItems: 8, items: { type: "object", properties: { topic: { type: "string" }, positions: { type: "array", items: { type: "string" } }, resolution: { type: "string" }, confidence: { type: "integer", minimum: 0, maximum: 100 } }, required: ["topic", "positions", "resolution", "confidence"] } },
    knowledge_gaps: { type: "array", maxItems: 8, items: { type: "string" } },
    reliability_assessment: { type: "object", properties: { overall_score: { type: "integer", minimum: 0, maximum: 100 }, label: { type: "string" }, rationale: { type: "string" }, limitations: { type: "array", items: { type: "string" } } }, required: ["overall_score", "label", "rationale", "limitations"] },
    source_assessments: { type: "array", maxItems: 12, items: { type: "object", properties: { source_index: { type: "integer" }, authority: { type: "integer", minimum: 0, maximum: 100 }, relevance: { type: "integer", minimum: 0, maximum: 100 }, evidence_quality: { type: "integer", minimum: 0, maximum: 100 }, notes: { type: "string" } }, required: ["source_index", "authority", "relevance", "evidence_quality", "notes"] } },
    safe_claims: { type: "array", maxItems: 10, items: { type: "string" } },
    claims_to_avoid: { type: "array", maxItems: 10, items: { type: "string" } },
    creative_opportunities: { type: "array", maxItems: 8, items: { type: "string" } },
    recommended_story_angle: { type: "string" },
    recommended_framework: { type: "string" },
    recommended_length_seconds: { type: "integer", minimum: 15, maximum: 60 },
    recommended_tone: { type: "string" },
  },
  required: ["executive_summary", "what_happened", "why_it_matters", "mechanism", "key_findings", "important_numbers", "disagreements", "knowledge_gaps", "reliability_assessment", "source_assessments", "safe_claims", "claims_to_avoid", "creative_opportunities", "recommended_story_angle", "recommended_framework", "recommended_length_seconds", "recommended_tone"],
};

function parseJson(textValue) {
  const raw = text(textValue);
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  for (const candidate of [fenced, raw]) {
    if (!candidate) continue;
    try { return JSON.parse(candidate); } catch { /* try next */ }
  }
  const start = raw.indexOf("{"); const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error("Research repair model returned invalid JSON.");
}

async function repairWithModel(topic, sources) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const configured = text(process.env.GEMINI_MODEL) || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(configured)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const corpus = sources.slice(0, REPAIR_SOURCE_LIMIT).map((source, index) => ({
    index: Number(source.index ?? index),
    title: text(source.title),
    url: text(source.url),
    publisher: text(source.publisher || source.source_name),
    read_status: text(source.read_status),
    quality_prior: clamp(source.quality_prior, 0, 100),
    content: text(source.content || source.read_excerpt).slice(0, REPAIR_SOURCE_CHARS),
  })).filter((source) => source.content);
  if (!corpus.length) return null;
  const prompt = `You are repairing a completed research report for ${topic}. The previous synthesis did not reliably populate structured findings. Using ONLY the supplied readable source corpus, produce a complete evidence-backed brief. Return at least ${MIN_FINDINGS} and at most ${MAX_FINDINGS} distinct key findings. Every finding MUST cite one or more source_indexes that actually contain supporting content. Do not infer from inaccessible sources or titles. Write executive_summary, what_happened, why_it_matters, and mechanism as clear research prose with concrete substance. Important numbers must be sourced. Identify uncertainty and disagreements rather than inventing consensus. Return JSON only according to the supplied schema.\n\nSOURCE CORPUS:\n${JSON.stringify(corpus)}\n\nSCHEMA:\n${JSON.stringify(REPAIR_SCHEMA)}`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: REPAIR_SCHEMA, temperature: 0.1, maxOutputTokens: 10000 } }),
      signal: AbortSignal.timeout(REPAIR_TIMEOUT_MS),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `Research repair returned ${response.status}.`);
    const raw = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
    return parseJson(raw);
  } catch (error) {
    console.warn(`[research] Structured brief repair failed: ${error.message || "unknown error"}`);
    return null;
  }
}

export async function ensureStructuredResearchReport(topic, brief = {}, sources = [], { onActivity } = {}) {
  const sourceCount = sources.length;
  const current = Array.isArray(brief.key_findings) ? brief.key_findings.map((finding) => normalizeFinding(finding, sourceCount)).filter((finding) => isUsableFinding(finding, sourceCount)) : [];
  let findings = current.slice(0, MAX_FINDINGS);
  let repaired = false;

  if (findings.length < MIN_FINDINGS) {
    const repairSources = sources.map((source, index) => ({ ...source, index: Number(source.index ?? index) })).filter((source) => text(source.content || source.read_excerpt));
    const repairedBrief = await repairWithModel(topic, repairSources);
    if (repairedBrief) {
      const repairedFindings = Array.isArray(repairedBrief.key_findings)
        ? repairedBrief.key_findings.map((finding) => normalizeFinding(finding, sourceCount)).filter((finding) => isUsableFinding(finding, sourceCount))
        : [];
      if (repairedFindings.length >= MIN_FINDINGS) {
        brief = { ...brief, ...repairedBrief };
        findings = repairedFindings.slice(0, MAX_FINDINGS);
        repaired = true;
        onActivity?.({ type: "research.structured_repair", findings: findings.length, message: `Structured research report repaired with ${findings.length} evidence-backed findings.` });
      }
    }
  }

  if (findings.length < MIN_FINDINGS) {
    const deterministic = deterministicFindings(topic, sources).map((finding) => normalizeFinding(finding, sourceCount));
    const existingKeys = new Set(findings.map((finding) => text(finding.claim).toLowerCase()));
    for (const finding of deterministic) {
      if (findings.length >= MIN_FINDINGS) break;
      const key = text(finding.claim).toLowerCase();
      if (existingKeys.has(key) || !isUsableFinding(finding, sourceCount)) continue;
      existingKeys.add(key);
      findings.push(finding);
    }
    if (findings.length > current.length) onActivity?.({ type: "research.structured_fallback", findings: findings.length, message: `Deterministic source-backed fallback added ${findings.length - current.length} structured findings.` });
  }

  const normalizedBrief = {
    ...brief,
    key_findings: findings,
  };
  const takeaways = buildTakeaways(findings, normalizedBrief.evidence_preview || []);
  const synthesisSections = buildSynthesisSections(normalizedBrief, findings, takeaways, topic);
  const bottomLine = buildBottomLine(normalizedBrief, findings, takeaways);
  const evidenceBackedTakeaways = takeaways.filter((item) => item.source_indexes.length > 0);
  const sourceIndexes = [...new Set(findings.flatMap((finding) => finding.source_indexes || []))].sort((a, b) => a - b);

  const executiveParts = [
    text(normalizedBrief.executive_summary),
    ...synthesisSections.filter((section) => section.heading !== "Evidence pattern" && section.heading !== "What remains uncertain").slice(0, 3).map((section) => `${section.heading}: ${section.body}`),
    evidenceBackedTakeaways.length ? `The report's strongest evidence-backed takeaways are: ${evidenceBackedTakeaways.slice(0, 3).map((item) => item.takeaway).join(" ")}` : "",
  ].filter(Boolean);
  const executiveSummary = executiveParts.join("\n\n").trim();

  return {
    ...normalizedBrief,
    executive_summary: executiveSummary,
    key_findings: findings,
    evidence_backed_takeaways: evidenceBackedTakeaways,
    synthesis_sections: synthesisSections,
    bottom_line: bottomLine,
    report_quality: {
      structured_findings: findings.length,
      evidence_backed_takeaways: evidenceBackedTakeaways.length,
      source_indexes_used: sourceIndexes,
      structured_repair_applied: repaired,
      minimum_findings_target: MIN_FINDINGS,
      target_met: findings.length >= MIN_FINDINGS,
    },
  };
}
