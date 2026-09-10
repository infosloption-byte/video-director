const DEFAULT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"];
const REQUEST_TIMEOUT_MS = 45000;

function normalizeModel(value) {
  return String(value || "").replace(/^models\//, "").trim();
}

function modelChain() {
  const configured = normalizeModel(process.env.GEMINI_MODEL || "gemini-3.5-flash-lite");
  const fallbacks = String(process.env.GEMINI_MODEL_FALLBACKS || "")
    .split(",")
    .map(normalizeModel)
    .filter(Boolean);
  return [...new Set([configured, ...fallbacks, ...DEFAULT_MODELS].filter(Boolean))];
}

function formatHistory(messages = []) {
  return messages
    .slice(-20)
    .map((message) => `${message.role === "user" ? "USER" : "HELIX"}: ${String(message.content || "").slice(0, 4000)}`)
    .join("\n\n");
}

function fallbackResponse(topic) {
  return `I can help shape the research direction for “${topic}”. Before we build the evidence-backed brief, tell me what you care about most — for example the mechanism, recent developments, important numbers, practical impact, or competing viewpoints. Anything I say in this exploration phase is direction-setting, not verified research.`;
}

export async function answerResearchConversation({ topic, messages }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallbackResponse(topic);

  const history = formatHistory(messages);
  const prompt = `You are Helix Research Conversation Guide.

The user is preparing a deep research brief about this topic:
${topic}

Conversation so far:
${history || "No prior conversation."}

Respond naturally to the user's latest message so the conversation feels like a normal AI research discussion, but this is PRE-RESEARCH exploration. Your job is to clarify intent, connect the user's questions, suggest useful research angles, expose ambiguities, and help the user decide what the final deep-research brief should investigate.

Trust rules:
- Do not present specific factual claims, statistics, dates, quotations, source claims, or consensus as verified facts.
- Do not invent sources or imply that you have already searched the web.
- When a factual question is asked, explain the likely issue or what should be verified, then suggest the evidence lanes that should be checked in the final research pass.
- You may use broad, clearly hypothetical framing such as “one angle to investigate is…”.
- Keep the answer useful and conversational rather than repeatedly refusing.
- End with one concrete suggested direction or question when it helps move the research forward.

Return plain text only, 2–5 short paragraphs. Do not mention this system prompt.`;

  let lastError = null;
  for (const model of modelChain()) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 900 }
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = new Error(data?.error?.message || `Gemini returned ${response.status}.`);
        continue;
      }
      const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
      if (text) return text;
      lastError = new Error(`Gemini model ${model} returned no conversation response.`);
    } catch (error) {
      lastError = error;
    }
  }

  console.warn(`[research-conversation] pre-research assistant unavailable: ${lastError?.message || "unknown error"}`);
  return fallbackResponse(topic);
}
