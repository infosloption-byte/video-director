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

function conversationResearchKey(messages = []) {
  const topicMessage = messages.find((message) => String(message?.id || "").startsWith("topic-"));
  const projectId = String(topicMessage?.id || "").replace(/^topic-/, "").trim();
  return projectId ? `conversation:${projectId}` : null;
}

function fallbackResponse(topic) {
  return `I can help shape the research direction for “${topic}”. Before we build the evidence-backed brief, tell me what you care about most — for example the mechanism, recent developments, important numbers, practical impact, or competing viewpoints. Anything I say in this exploration phase is direction-setting, not verified research.`;
}

export async function answerResearchConversation({ topic, messages }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallbackResponse(topic);

  const { registerResearchController, clearResearchController } = await import("./researchCancellation.js");
  const researchKey = conversationResearchKey(messages);
  const controller = researchKey ? registerResearchController(researchKey) : null;
  const history = formatHistory(messages);
  const prompt = `You are Helix Research Conversation Guide.\n\nThe user is preparing a deep research brief about this topic:\n${topic}\n\nConversation so far:\n${history || "No prior conversation."}\n\nRespond naturally to the user's latest message so the conversation feels like a normal AI research discussion, but this is PRE-RESEARCH exploration. Your job is to clarify intent, connect the user's questions, suggest useful research angles, expose ambiguities, and help the user decide what the final deep-research brief should investigate.\n\nTrust rules:\n- Do not present specific factual claims, statistics, dates, quotations, source claims, or consensus as verified facts.\n- Do not invent sources or imply that you have already searched the web.\n- When a factual question is asked, explain the likely issue or what should be verified, then suggest the evidence lanes that should be checked in the final research pass.\n- You may use broad, clearly hypothetical framing such as “one angle to investigate is…”.\n- Keep the answer useful and conversational rather than repeatedly refusing.\n- End with one concrete suggested direction or question when it helps move the research forward.\n\nReturn plain text only, 2–5 short paragraphs. Do not mention this system prompt.`;

  try {
    let lastError = null;
    for (const model of modelChain()) {
      const timeoutController = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        timeoutController.abort(new Error("Gemini request timed out."));
      }, REQUEST_TIMEOUT_MS);
      const signal = controller ? AbortSignal.any([controller.signal, timeoutController.signal]) : timeoutController.signal;
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 900 }
          }),
          signal
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
        if (controller?.signal.aborted && !timedOut) {
          const stopped = new Error("Research conversation was stopped by the user.");
          stopped.code = "RESEARCH_CONVERSATION_STOPPED";
          throw stopped;
        }
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }
    }
    console.warn(`[research-conversation] pre-research assistant unavailable: ${lastError?.message || "unknown error"}`);
    return fallbackResponse(topic);
  } finally {
    if (researchKey && controller) clearResearchController(researchKey, controller);
  }
}
