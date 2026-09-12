const DEFAULT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"];
const REQUEST_TIMEOUT_MS = 60000;
const MAX_OUTPUT_TOKENS = 2200;

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
    .map((message) => `${message.role === "user" ? "USER" : "HELIX"}: ${String(message.content || "").slice(0, 6000)}`)
    .join("\n\n");
}

function conversationResearchKey(messages = []) {
  const topicMessage = messages.find((message) => String(message?.id || "").startsWith("topic-"));
  const projectId = String(topicMessage?.id || "").replace(/^topic-/, "").trim();
  return projectId ? `conversation:${projectId}` : null;
}

function fallbackResponse(topic) {
  return `I can help shape the research direction for “${topic}”.\n\nStart with the part you want to understand most: the timeline, mechanism, major changes, important evidence, key numbers, or competing explanations. I’ll connect your questions as the conversation develops.\n\nThis exploration is for research direction; factual claims still need to be checked during the evidence-backed research pass.`;
}

function looksTruncated(value = "") {
  const answer = String(value || "").trim();
  if (answer.length < 160) return true;
  if (answer.endsWith("…") || answer.endsWith("...") || answer.endsWith("—") || answer.endsWith("-")) return true;
  if (answer.endsWith(".") || answer.endsWith("!") || answer.endsWith("?") || answer.endsWith(":") || answer.endsWith(")") || answer.endsWith("]") || answer.endsWith("`")) return false;
  const lastLine = answer.split("\n").pop()?.trim() || "";
  if (/^[-*]\s+/.test(lastLine) || /^\d+[.)]\s+/.test(lastLine)) return true;
  return false;
}

function normalizeConversationMarkdown(value = "") {
  let answer = String(value || "")
    .replace(/\\r\\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  // Keep Markdown structure on its own lines. Models occasionally emit
  // separators/headings inline, which makes the custom renderer treat them
  // as one large paragraph.
  answer = answer
    .replace(/\s*-{3,}\s*(?=#{1,3}\s+)/g, "\n\n")
    .replace(/([.!?])\s+(?=#{1,3}\s+)/g, "$1\n\n")
    .replace(/\s+(#{1,3})\s+(?=[A-Z][^\n]{2,80}$)/g, "\n\n$1 ")
    .replace(/\s+(?=\d+[.)]\s+)/g, "\n")
    .replace(/\s+(?=[-*+]\s+[^\n])/g, "\n")
    .replace(/\*{4,}|_{4,}/g, "")
    .replace(/\\([*_#])/g, "$1");

  // Remove unmatched emphasis delimiters so one stray token cannot italicize
  // the remainder of the response in the custom inline Markdown renderer.
  for (const delimiter of ["**", "__", "*", "_"]) {
    const escaped = delimiter.replace(/[*]/g, "\\*").replace(/_/g, "\\_");
    const occurrences = (answer.match(new RegExp(escaped, "g")) || []).length;
    if (occurrences % 2 === 1) answer = answer.split(delimiter).join("");
  }

  return answer.replace(/\n{3,}/g, "\n\n").trim();
}

function conversationPrompt(topic, history, repair = false) {
  return `You are Helix Research Conversation Guide.

Research topic:
${topic}

Conversation so far:
${history || "No prior conversation."}

The user is still in the PRE-RESEARCH exploration stage. Answer the user's latest question directly and completely while helping shape the eventual deep-research brief.

Important behavior:
- Treat the conversation as a normal, useful AI discussion. Do not repeatedly ask the user to clarify when the question is answerable from broad background knowledge.
- For straightforward factual questions, give a useful explanatory answer first, then state what should be verified during the later research pass when appropriate.
- Connect the answer to earlier questions in the conversation so follow-ups feel contextual rather than reset.
- Prefer 4–8 short paragraphs, or a short heading plus a concise numbered/bulleted list when that is clearer.
- Put every heading, numbered item, or bullet on its own line with a blank line before a heading.
- Use standard Markdown syntax only: `**bold**`, `*italic*`, `# headings`, `- bullets`, and `1. numbered items`. Do not put formatting delimiters inside words and do not use repeated asterisks as decoration.
- Explain terms, relationships, examples, and boundaries when they help answer the question.
- Never stop mid-sentence, mid-word, or mid-list. End on a complete thought.
- Do not wrap the whole answer in a code block.
- Do not invent sources, quotations, statistics, or pretend a web search has already happened.
- Mark specific facts as general/background context when they have not been verified against the research corpus.
- Keep the answer self-contained enough that the user does not need to ask “what do you mean?” immediately afterward.
- If the question asks for a comparison or a list, provide the actual comparison/list rather than only describing how it could be researched.

${repair ? "A previous generation appears incomplete or poorly formatted. Rewrite the answer from scratch as one complete, cleanly formatted response. Do not mention formatting or this instruction." : "Return one complete, cleanly formatted response to the latest user question."}`;
}

async function requestModel(model, apiKey, prompt, signal, maxOutputTokens = MAX_OUTPUT_TOKENS) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.35, maxOutputTokens }
    }),
    signal
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Gemini returned ${response.status}.`);
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) throw new Error(`Gemini model ${model} returned no conversation response.`);
  return text;
}

export async function answerResearchConversation({ topic, messages }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallbackResponse(topic);

  const { registerResearchController, clearResearchController } = await import("./researchCancellation.js");
  const researchKey = conversationResearchKey(messages);
  const controller = researchKey ? registerResearchController(researchKey) : null;
  const history = formatHistory(messages);

  try {
    let lastError = null;
    for (const model of modelChain()) {
      if (controller?.signal.aborted) {
        const stopped = new Error("Research conversation was stopped by the user.");
        stopped.code = "RESEARCH_CONVERSATION_STOPPED";
        throw stopped;
      }

      const timeoutController = new AbortController();
      const timeout = setTimeout(() => timeoutController.abort(new Error("Gemini request timed out.")), REQUEST_TIMEOUT_MS);
      const signal = controller ? AbortSignal.any([controller.signal, timeoutController.signal]) : timeoutController.signal;

      try {
        let text = await requestModel(model, apiKey, conversationPrompt(topic, history), signal);

        if (looksTruncated(text)) {
          text = await requestModel(model, apiKey, conversationPrompt(topic, history, true), signal, 2400);
        }

        if (!looksTruncated(text)) return normalizeConversationMarkdown(text);
        lastError = new Error(`Gemini model ${model} returned an incomplete conversation response.`);
      } catch (error) {
        if (controller?.signal.aborted && !timeoutController.signal.aborted) {
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
    return normalizeConversationMarkdown(fallbackResponse(topic));
  } finally {
    if (researchKey && controller) clearResearchController(researchKey, controller);
  }
}
