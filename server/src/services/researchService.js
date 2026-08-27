import { searchSourceCascade } from "./sourceCascade.js";

const MAX_SOURCE_CHARS = 18000;
const MAX_SUPPORTING_SOURCES = 6;

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

async function callGemini(context) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const prompt = `You are Helix, a science and technology Reel research director. Produce a concise, evidence-aware research brief. Never invent facts. Prefer peer-reviewed evidence when sources disagree. Preserve source reliability. Identify monetization risks for a mainstream social video. Return ONLY valid JSON with this exact shape: {"key_facts":["..."],"mechanism_summary":"...","sources":[{"title":"...","url":"...","note":"...","source_reliability":"peer_reviewed|ai_search|general_web"}],"monetization_flags":[{"issue":"...","severity":"low|medium|high"}],"recommended_framework":"CONTEXT|CONTRAST|EXPLAINER|PROBLEM","recommended_length_seconds":15,"recommended_tone":"Energetic|Calm & authoritative|Conversational","reasoning":"..."}\n\nResearch context:\n${context}`;
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.2 } }), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Gemini returned ${response.status}.`);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty research brief.");
  try { return JSON.parse(text); } catch { const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]; if (!fenced) throw new Error("Gemini returned invalid research JSON."); return JSON.parse(fenced); }
}

export async function researchSignal(signal) {
  const [sourceText, cascadeResults] = await Promise.all([fetchSourceText(signal), searchSourceCascade(signal.title)]);
  const supportingSources = cascadeResults.filter((item) => item.sourceUrl !== signal.sourceUrl);
  const brief = await callGemini(buildContext(signal, sourceText, supportingSources));
  return {
    ...brief,
    key_facts: Array.isArray(brief.key_facts) ? brief.key_facts : [],
    sources: Array.isArray(brief.sources) ? brief.sources : [],
    monetization_flags: Array.isArray(brief.monetization_flags) ? brief.monetization_flags : [],
    recommended_length_seconds: [15, 30, 45, 60].includes(Number(brief.recommended_length_seconds)) ? Number(brief.recommended_length_seconds) : 30,
  };
}
