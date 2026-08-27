import { searchSourceCascade } from "./sourceCascade.js";

const MAX_SOURCE_CHARS = 18000;
const MAX_SUPPORTING_SOURCES = 6;
const GEMINI_MAX_ATTEMPTS = 3;
const GEMINI_RETRY_BASE_MS = 1200;

function cleanText(value = "") {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, " ").trim();
}

async function fetchSourceText(signal) {
  if (signal.rawContent?.trim()) return signal.rawContent.trim().slice(0, MAX_SOURCE_CHARS);
  if (!signal.sourceUrl) return "";
  try {
    const response = await fetch(signal.sourceUrl, { headers: { "User-Agent": "HelixResearch/1.0" }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/") && !contentType.includes("html") && !contentType.includes("xml")) return "";
    return cleanText(await response.text()).slice(0, MAX_SOURCE_CHARS);
  } catch (error) {
    console.warn(`[research] Source fetch failed: ${error.message}`);
    return "";
  }
}

function buildContext(signal, sourceText, supportingSources) {
  return JSON.stringify({
    selected_signal: { title: signal.title, description: signal.description, category: signal.category, source_name: signal.sourceName, source_url: signal.sourceUrl, source_reliability: signal.sourceReliability },
    source_text: sourceText || "Source text unavailable; state evidence limitations explicitly.",
    supporting_sources: supportingSources.slice(0, MAX_SUPPORTING_SOURCES).map((item) => ({ title: item.title, description: item.description, url: item.sourceUrl, sourceName: item.sourceName, reliability: item.sourceReliability, publishedAt: item.publishedAt })),
  });
}

const RESEARCH_SCHEMA = {
  type: "object",
  properties: {
    key_facts: { type: "array", items: { type: "string" }, maxItems: 6 },
    mechanism_summary: { type: "string" },
    sources: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          note: { type: "string" },
          source_reliability: { type: "string", enum: ["peer_reviewed", "ai_search", "general_web"] },
        },
        required: ["title", "url", "note", "source_reliability"],
      },
    },
    monetization_flags: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          issue: { type: "string" },
          severity: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["issue", "severity"],
      },
    },
    recommended_framework: { type: "string", enum: ["CONTEXT", "CONTRAST", "EXPLAINER", "PROBLEM"] },
    recommended_length_seconds: { type: "integer", enum: [15, 30, 45, 60] },
    recommended_tone: { type: "string", enum: ["Energetic", "Calm & authoritative", "Conversational"] },
    reasoning: { type: "string" },
  },
  required: ["key_facts", "mechanism_summary", "sources", "monetization_flags", "recommended_framework", "recommended_length_seconds", "recommended_tone", "reasoning"],
};

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("Gemini returned an empty research brief.");
  const candidates = [raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1], raw].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Keep trying a bounded object extraction below.
    }
  }
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try { return JSON.parse(raw.slice(firstBrace, lastBrace + 1)); } catch { /* normalized below */ }
  }
  throw new Error("Gemini returned invalid research JSON.");
}

function isRetryableGeminiStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

async function callGemini(context) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const prompt = `You are Helix, a science and technology Reel research director. Produce a concise, evidence-aware research brief from the supplied evidence. Never invent facts. Prefer peer-reviewed evidence when sources disagree. Preserve source reliability and explicitly note evidence limitations. Return a single JSON object conforming exactly to the supplied response schema.\n\nResearch context:\n${context}`;

  let lastError = null;
  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESEARCH_SCHEMA,
            temperature: 0.1,
            maxOutputTokens: 4096,
          },
        }),
        signal: AbortSignal.timeout(30000),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const providerMessage = data?.error?.message || `Gemini returned ${response.status}.`;
        const error = new Error(providerMessage);
        error.status = response.status;
        throw error;
      }

      const candidate = data.candidates?.[0];
      const finishReason = candidate?.finishReason;
      const text = candidate?.content?.parts?.map((part) => part.text || "").join("").trim();
      if (!text) {
        const error = new Error(finishReason ? `Gemini returned no research JSON (finish reason: ${finishReason}).` : "Gemini returned an empty research brief.");
        error.status = 502;
        throw error;
      }
      return extractJsonObject(text);
    } catch (error) {
      lastError = error;
      const retryable = isRetryableGeminiStatus(error.status) || error.name === "AbortError" || error.cause?.code === "UND_ERR_CONNECT_TIMEOUT";
      if (!retryable || attempt === GEMINI_MAX_ATTEMPTS) break;
      const delay = GEMINI_RETRY_BASE_MS * (2 ** (attempt - 1));
      console.warn(`[research] Gemini attempt ${attempt}/${GEMINI_MAX_ATTEMPTS} failed (${error.message}). Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  if (lastError?.status) throw new Error(`Gemini research failed after ${GEMINI_MAX_ATTEMPTS} attempts: ${lastError.message}`);
  throw lastError || new Error("Gemini research generation failed.");
}

export async function researchSignal(signal, { onProgress } = {}) {
  onProgress?.("reading", 10);
  const sourceText = await fetchSourceText(signal);

  onProgress?.("cross_checking", 35);
  let cascadeResults = [];
  try {
    cascadeResults = await searchSourceCascade(signal.title);
  } catch (error) {
    console.warn(`[research] Source cross-check failed: ${error.message}`);
  }

  onProgress?.("drafting", 65);
  const supportingSources = cascadeResults.filter((item) => item.sourceUrl !== signal.sourceUrl);
  const brief = await callGemini(buildContext(signal, sourceText, supportingSources));
  onProgress?.("ready", 100);

  return {
    ...brief,
    key_facts: Array.isArray(brief.key_facts) ? brief.key_facts : [],
    sources: Array.isArray(brief.sources) ? brief.sources : [],
    monetization_flags: Array.isArray(brief.monetization_flags) ? brief.monetization_flags : [],
    recommended_length_seconds: [15, 30, 45, 60].includes(Number(brief.recommended_length_seconds)) ? Number(brief.recommended_length_seconds) : 30,
  };
}
