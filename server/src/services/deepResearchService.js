import { searchSourceCascade } from "./sourceCascade.js";

const MAX_DISCOVERY_RESULTS = 36;
const MAX_READABLE_SOURCES = 12;
const MAX_SOURCE_CHARS = 12000;
const MAX_EVIDENCE_CHARS = 1800;
const MAX_PASSAGES_PER_FINDING = 3;

const SOURCE_WEIGHTS = {
  peer_reviewed: 0.95,
  government: 0.95,
  primary: 0.92,
  trusted_news: 0.82,
  ai_search: 0.68,
  general_web: 0.45,
};

function cleanText(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function hostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function sourceClass(item) {
  const host = hostname(item.sourceUrl).toLowerCase();
  if (item.sourceReliability === "peer_reviewed" || /doi\.org|pubmed|nature\.com|science\.org|cell\.com|springer\.com|sciencedirect\.com/.test(host)) return "academic";
  if (/\.gov$|\.gov\.|who\.int|un\.org|europa\.eu/.test(host)) return "government";
  if (item.sourceType === "tavily" || item.sourceType === "brave") return "discovery";
  return "web";
}

function sourceQuality(item) {
  const host = hostname(item.sourceUrl);
  const base = SOURCE_WEIGHTS[item.sourceReliability] ?? 0.45;
  const primaryBonus = /\.gov$|\.gov\.|who\.int|doi\.org|pubmed|nature\.com|science\.org/.test(host) ? 0.08 : 0;
  const datedBonus = item.publishedAt instanceof Date && !Number.isNaN(item.publishedAt.getTime()) ? 0.04 : 0;
  return Math.min(1, base + primaryBonus + datedBonus);
}

function dedupeSources(items) {
  const seen = new Map();
  for (const item of items) {
    if (!item?.sourceUrl || !item.title) continue;
    const key = item.sourceUrl.toLowerCase().replace(/#.*$/, "");
    const current = seen.get(key);
    if (!current || sourceQuality(item) > sourceQuality(current)) seen.set(key, item);
  }
  return [...seen.values()];
}

function buildResearchPlan(topic) {
  return [
    { id: "definition", question: `What exactly is ${topic}, and what is the most precise definition?` },
    { id: "mechanism", question: `How does ${topic} work, and what mechanism explains the observed effect?` },
    { id: "evidence", question: `What primary, academic, government, or institutional evidence supports the main claims about ${topic}?` },
    { id: "numbers", question: `What important measurements, statistics, dates, sample sizes, percentages, or comparisons exist for ${topic}?` },
    { id: "counterevidence", question: `What evidence challenges, qualifies, or contradicts common claims about ${topic}?` },
    { id: "recent", question: `What important developments or changes about ${topic} are recent?` },
  ];
}

async function readSource(source) {
  const url = source.sourceUrl;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return { ...source, readStatus: "unsupported", content: "" };
    const response = await fetch(url, {
      headers: { "User-Agent": "HelixResearch/2.0", Accept: "text/html,text/plain,application/xhtml+xml,application/xml" },
      signal: AbortSignal.timeout(18000),
    });
    if (!response.ok) return { ...source, readStatus: `http_${response.status}`, content: "" };
    const type = response.headers.get("content-type") || "";
    if (!/(text|html|xml)/i.test(type)) return { ...source, readStatus: "non_text", content: "" };
    const content = cleanText(await response.text()).slice(0, MAX_SOURCE_CHARS);
    return { ...source, readStatus: content ? "read" : "empty", content };
  } catch (error) {
    return { ...source, readStatus: "failed", readError: error.message, content: "" };
  }
}

const DEEP_SCHEMA = {
  type: "object",
  properties: {
    executive_summary: { type: "string" },
    what_happened: { type: "string" },
    why_it_matters: { type: "string" },
    mechanism: { type: "string" },
    key_findings: { type: "array", minItems: 8, maxItems: 15, items: { type: "object", properties: { claim: { type: "string" }, evidence: { type: "string" }, confidence: { type: "integer", minimum: 0, maximum: 100 }, evidence_level: { type: "string", enum: ["established", "strong", "mixed", "limited", "unverified", "disputed"] }, source_indexes: { type: "array", items: { type: "integer" } } }, required: ["claim", "evidence", "confidence", "evidence_level", "source_indexes"] } },
    important_numbers: { type: "array", maxItems: 12, items: { type: "object", properties: { value: { type: "string" }, context: { type: "string" }, source_indexes: { type: "array", items: { type: "integer" } } }, required: ["value", "context", "source_indexes"] } },
    disagreements: { type: "array", maxItems: 8, items: { type: "object", properties: { topic: { type: "string" }, positions: { type: "array", items: { type: "string" } }, resolution: { type: "string" }, confidence: { type: "integer", minimum: 0, maximum: 100 } }, required: ["topic", "positions", "resolution", "confidence"] } },
    knowledge_gaps: { type: "array", maxItems: 8, items: { type: "string" } },
    reliability_assessment: { type: "object", properties: { overall_score: { type: "integer", minimum: 0, maximum: 100 }, label: { type: "string", enum: ["high", "moderate", "mixed", "low"] }, rationale: { type: "string" }, limitations: { type: "array", items: { type: "string" } } }, required: ["overall_score", "label", "rationale", "limitations"] },
    source_assessments: { type: "array", maxItems: 12, items: { type: "object", properties: { source_index: { type: "integer" }, authority: { type: "integer", minimum: 0, maximum: 100 }, relevance: { type: "integer", minimum: 0, maximum: 100 }, evidence_quality: { type: "integer", minimum: 0, maximum: 100 }, notes: { type: "string" } }, required: ["source_index", "authority", "relevance", "evidence_quality", "notes"] } },
    safe_claims: { type: "array", maxItems: 10, items: { type: "string" } },
    claims_to_avoid: { type: "array", maxItems: 10, items: { type: "string" } },
    creative_opportunities: { type: "array", maxItems: 8, items: { type: "string" } },
    recommended_story_angle: { type: "string" },
    recommended_framework: { type: "string", enum: ["CONTEXT", "CONTRAST", "EXPLAINER", "PROBLEM"] },
    recommended_length_seconds: { type: "integer", minimum: 15, maximum: 60 },
    recommended_tone: { type: "string", enum: ["Energetic", "Calm & authoritative", "Conversational"] },
  },
  required: ["executive_summary", "what_happened", "why_it_matters", "mechanism", "key_findings", "important_numbers", "disagreements", "knowledge_gaps", "reliability_assessment", "source_assessments", "safe_claims", "claims_to_avoid", "creative_opportunities", "recommended_story_angle", "recommended_framework", "recommended_length_seconds", "recommended_tone"],
};

function extractJson(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  for (const candidate of [fenced, raw]) {
    if (!candidate) continue;
    try { return JSON.parse(candidate); } catch {}
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error("Deep research model returned invalid JSON.");
}

function tokenize(value = "") {
  return new Set(String(value).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((token) => token.length > 3));
}

function textOverlap(left = "", right = "") {
  const a = tokenize(left); const b = tokenize(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / Math.max(1, Math.min(a.size, b.size));
}

function exactPassages(content = "", limit = MAX_PASSAGES_PER_FINDING) {
  const source = String(content || "");
  const matches = [];
  const regex = /[^.!?\n]+(?:[.!?](?=\s|$)|$)/g;
  for (const match of source.matchAll(regex)) {
    const text = match[0].trim();
    if (text.length < 40) continue;
    const start = match.index + match[0].indexOf(text);
    matches.push({ text, start, end: start + text.length });
  }
  if (matches.length <= limit) return matches;
  const selected = [];
  for (let index = 0; index < matches.length; index += 1) {
    if (index % 2 === 0 || selected.length < limit) selected.push(matches[index]);
    if (selected.length >= limit) break;
  }
  return selected;
}

function attachExactEvidence(readResults, brief) {
  const findings = Array.isArray(brief.key_findings) ? brief.key_findings : [];
  const passages = [];
  const enriched = findings.map((finding, findingIndex) => {
    const sourceIndexes = [...new Set((finding.source_indexes || []).map(Number).filter(Number.isInteger))];
    const candidates = [];
    for (const sourceIndex of sourceIndexes) {
      const source = readResults.find((item, index) => index === sourceIndex);
      if (!source?.content) continue;
      for (const passage of exactPassages(source.content)) {
        candidates.push({ ...passage, source_index: sourceIndex, title: source.title, score: textOverlap(`${finding.claim} ${finding.evidence}`, passage.text) });
      }
    }
    const selected = candidates.sort((a, b) => b.score - a.score).slice(0, MAX_PASSAGES_PER_FINDING);
    const evidenceIndexes = [];
    for (const passage of selected) {
      const evidenceIndex = passages.length;
      passages.push({ evidence_index: evidenceIndex, source_index: passage.source_index, title: passage.title, excerpt: passage.text, start_offset: passage.start, end_offset: passage.end, locator: `chars:${passage.start}-${passage.end}`, evidence_type: "claim_support" });
      evidenceIndexes.push(evidenceIndex);
    }
    return { ...finding, evidence_indexes: evidenceIndexes, evidence_passage_count: evidenceIndexes.length };
  });
  return { ...brief, key_findings: enriched, evidence_preview: passages, evidence_passage_quality: { exact: passages.length, claim_linked: findings.length ? Math.round(enriched.filter((finding) => finding.evidence_indexes?.length).length / findings.length * 100) : 0 } };
}

async function synthesize(topic, plan, sources, onProgress) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const evidence = sources.map((source, index) => ({
    index: source.researchSourceIndex ?? index,
    title: source.title,
    url: source.sourceUrl,
    source_name: source.sourceName,
    source_class: source.sourceClass,
    source_reliability: source.sourceReliability,
    published_at: source.publishedAt,
    quality_prior: Math.round(sourceQuality(source) * 100),
    content: source.content || source.description || "No readable source text available.",
  }));
  const prompt = `You are Helix Deep Research Director. Research topic: ${topic}\n\nRESEARCH PLAN:\n${JSON.stringify(plan)}\n\nEVIDENCE CORPUS:\n${JSON.stringify(evidence)}\n\nProduce a detailed evidence-backed research intelligence brief. Aim for 8–15 major findings. Do not invent facts, numbers, quotes, sources, consensus, or evidence. Every important finding must cite one or more exact source_indexes from the supplied evidence corpus. Distinguish source authority from claim confidence. Prefer primary, academic, government and institutional evidence, but do not automatically treat peer review as proof. Explicitly identify conflicting evidence and methodological or access limitations. If a source could not be read, do not infer its contents from its title. The output is for a video research workflow, so explain the mechanism clearly and separately provide claims that are safe to say and claims that should be avoided. Return JSON only according to the schema.`;

  onProgress?.("synthesizing", 72);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: DEEP_SCHEMA, temperature: 0.1, maxOutputTokens: 12000 } }),
    signal: AbortSignal.timeout(120000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Gemini returned ${response.status}.`);
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) throw new Error("Deep research model returned no brief.");
  return extractJson(text);
}

export async function deepResearchSignal(signal, { onProgress } = {}) {
  const topic = String(signal?.title || "").trim();
  if (!topic) throw new Error("A research topic is required.");

  onProgress?.("planning", 5);
  const plan = buildResearchPlan(topic);

  const queries = [topic, `${topic} scientific evidence`, `${topic} mechanism research`, `${topic} statistics data`, `${topic} recent developments`, `${topic} criticism limitations controversy`];
  onProgress?.("discovering", 12);
  const batches = await Promise.allSettled(queries.map((query) => searchSourceCascade(query)));
  const discovered = dedupeSources(batches.flatMap((batch) => batch.status === "fulfilled" ? batch.value : []))
    .sort((a, b) => sourceQuality(b) - sourceQuality(a) || (b.searchScore || 0) - (a.searchScore || 0))
    .slice(0, MAX_DISCOVERY_RESULTS)
    .map((item) => ({ ...item, sourceClass: sourceClass(item) }));

  onProgress?.("reading", 30);
  const primary = signal.sourceUrl ? [{ title: signal.title, description: signal.description || "", sourceName: signal.sourceName || "Selected source", sourceUrl: signal.sourceUrl, sourceReliability: signal.sourceReliability || "general_web", sourceType: "selected", publishedAt: signal.publishedAt ? new Date(signal.publishedAt) : null }] : [];
  const readingQueue = dedupeSources([...primary, ...discovered])
    .sort((a, b) => sourceQuality(b) - sourceQuality(a) || (b.searchScore || 0) - (a.searchScore || 0))
    .slice(0, MAX_READABLE_SOURCES)
    .map((item) => ({ ...item, sourceClass: sourceClass(item) }));

  const readResults = [];
  for (let index = 0; index < readingQueue.length; index += 3) {
    const batch = await Promise.all(readingQueue.slice(index, index + 3).map(readSource));
    readResults.push(...batch);
    onProgress?.("reading", Math.min(68, 30 + Math.round((readResults.length / Math.max(1, readingQueue.length)) * 38)));
  }

  const readable = readResults.filter((item) => item.content).slice(0, MAX_READABLE_SOURCES).map((item) => ({ ...item, researchSourceIndex: readResults.indexOf(item) }));
  onProgress?.("verifying", 70);
  const brief = await synthesize(topic, plan, readable.length ? readable : readResults.map((item) => ({ ...item, researchSourceIndex: readResults.indexOf(item) })), onProgress);
  const evidenceLinkedBrief = attachExactEvidence(readResults, brief);

  const sources = readResults.map((item, index) => ({
    index,
    title: item.title,
    url: item.sourceUrl,
    note: item.content ? `${item.sourceName || hostname(item.sourceUrl)} — source read successfully.` : `${item.sourceName || hostname(item.sourceUrl)} — source could not be fully read; treat as unverified.`,
    source_name: item.sourceName,
    source_class: item.sourceClass,
    source_reliability: item.sourceReliability,
    quality_prior: Math.round(sourceQuality(item) * 100),
    read_status: item.readStatus,
    read_excerpt: item.content ? item.content.slice(0, MAX_SOURCE_CHARS) : null,
    published_at: item.publishedAt,
  }));

  const normalizedEvidence = (evidenceLinkedBrief.evidence_preview || []).map((item) => ({ ...item, source_index: Number(item.source_index) }));
  const finalBrief = { ...evidenceLinkedBrief, evidence_preview: normalizedEvidence };

  onProgress?.("ready", 100);
  return {
    ...finalBrief,
    research_plan: plan,
    research_metrics: {
      discovered_sources: discovered.length,
      sources_selected: readingQueue.length,
      sources_read: readable.length,
      sources_unread: readResults.length - readable.length,
      evidence_passages: normalizedEvidence.length,
      exact_passages: normalizedEvidence.length,
      findings_with_evidence: (finalBrief.key_findings || []).filter((finding) => finding.evidence_indexes?.length).length,
    },
    sources,
    key_facts: (finalBrief.key_findings || []).map((item) => item.claim).slice(0, 15),
    mechanism_summary: finalBrief.mechanism,
    monetization_flags: [],
  };
}
