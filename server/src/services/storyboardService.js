const ALLOWED_LENGTHS = [15, 30, 45, 60];
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 1500;

const STORYBOARD_SCHEMA = {
  type: "object",
  properties: {
    scenes: {
      type: "array",
      minItems: 4,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          spoken_text: { type: "string" },
          duration_seconds: { type: "number" },
          why_line: { type: "string" },
          why_picture: { type: "string" },
          broll_search_term: { type: "string" },
        },
        required: ["title", "spoken_text", "duration_seconds", "why_line", "why_picture", "broll_search_term"],
      },
    },
  },
  required: ["scenes"],
};

function parseJson(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("Gemini returned an empty storyboard.");
  const candidates = [raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1], raw].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Keep trying bounded extraction below.
    }
  }
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch {
      // Fall through to normalized error.
    }
  }
  throw new Error("Gemini returned invalid storyboard JSON.");
}

function isRetryable(error) {
  return error?.status === 408 || error?.status === 429 || error?.status >= 500 || error?.name === "AbortError" || error?.name === "TimeoutError" || error?.cause?.code === "UND_ERR_CONNECT_TIMEOUT";
}

function retryDelay(error, attempt) {
  const retryAfter = Number(error?.retryAfterSeconds);
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(30000, retryAfter * 1000);
  return Math.min(12000, RETRY_BASE_MS * (2 ** (attempt - 1)));
}

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: STORYBOARD_SCHEMA,
            temperature: 0.2,
            maxOutputTokens: 4096,
          },
        }),
        signal: AbortSignal.timeout(90000),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data?.error?.message || `Gemini returned ${response.status}.`);
        error.status = response.status;
        const retryAfter = Number(response.headers.get("retry-after"));
        if (Number.isFinite(retryAfter)) error.retryAfterSeconds = retryAfter;
        throw error;
      }

      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.map((part) => part.text || "").join("").trim();
      if (!text) {
        const error = new Error(`Gemini returned no storyboard JSON${candidate?.finishReason ? ` (finish reason: ${candidate.finishReason})` : ""}.`);
        error.status = 502;
        throw error;
      }
      return parseJson(text);
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === MAX_ATTEMPTS) break;
      const delay = retryDelay(error, attempt);
      console.warn(`[storyboard] Gemini attempt ${attempt}/${MAX_ATTEMPTS} failed (${error.message}). Retrying in ${Math.ceil(delay / 1000)}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  const error = new Error(`Gemini storyboard generation failed after ${MAX_ATTEMPTS} attempts: ${lastError?.message || "Unknown error."}`);
  error.status = lastError?.status || 502;
  error.retryAfterSeconds = lastError?.retryAfterSeconds;
  throw error;
}

function normalizeScene(scene, index, targetLength) {
  const duration = Number(scene.duration_seconds);
  return {
    scene_order: index + 1,
    title: String(scene.title || `Scene ${index + 1}`).trim().slice(0, 255),
    spoken_text: String(scene.spoken_text || scene.line || "").trim(),
    duration_seconds: Number.isFinite(duration) && duration > 0 ? Math.min(duration, 30) : Math.max(2, targetLength / 6),
    why_line: String(scene.why_line || "").trim(),
    why_picture: String(scene.why_picture || "").trim(),
    broll_search_term: String(scene.broll_search_term || scene.title || "science technology").trim().slice(0, 160),
  };
}

function fallbackSentences(project, signal) {
  const bullets = String(project.researchSummary || "")
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[•*-]\s*/, "").trim())
    .filter(Boolean);
  const mechanism = bullets[0] || signal.description || "The evidence points to a meaningful change in this technology story.";
  const facts = bullets.slice(1, 4);
  return [
    `Here is what is changing: ${signal.title}.`,
    mechanism,
    ...facts,
    `The practical takeaway is what this means next for people using the technology.`,
  ].filter(Boolean);
}

function buildFallbackStoryboard({ project, signal, length }) {
  const lines = fallbackSentences(project, signal).slice(0, 6);
  while (lines.length < 4) lines.push("The evidence is still developing, so the safest conclusion is to watch what happens next.");
  const base = Math.max(2.5, length / lines.length);
  return lines.map((spokenText, index) => normalizeScene({
    title: index === 0 ? "The signal" : index === lines.length - 1 ? "What happens next" : `The mechanism ${index}`,
    spoken_text: spokenText,
    duration_seconds: base,
    why_line: "Fallback storyboard created from the completed research brief while Gemini is rate-limited.",
    why_picture: "Use a concrete visual tied to the mechanism or claim described in this scene.",
    broll_search_term: signal.title,
  }, index, length));
}

export async function generateStoryboard({ project, signal }) {
  const length = ALLOWED_LENGTHS.includes(Number(project.scriptLengthSeconds)) ? Number(project.scriptLengthSeconds) : 30;
  const prompt = `You are Helix, a short-form science and technology Reel director. Create a complete scene-by-scene storyboard for a ${length}-second vertical video. Use the supplied research only; do not invent facts. The storyboard must explain the mechanism clearly and keep the selected framework and tone. Each scene needs a concise spoken line, a reason that line belongs, a reason for the picture, and a concrete B-roll search phrase suitable for Pexels.

Return ONLY a single JSON object matching this schema exactly. Do not include markdown or commentary.

Rules:
- 4 to 8 scenes.
- Sum duration_seconds to approximately the requested length (within 1 second).
- Spoken text should sound natural aloud and fit the scene duration.
- Start with a strong hook; finish with a clear takeaway or question.
- Do not put citations inside spoken_text.
- B-roll terms should describe visible subjects/actions, not abstract claims.
- The selected framework is ${project.selectedFramework || "how-it-works"}; tone is ${project.tone || "Conversational"}; audience is ${project.audienceLevel || "General public"}.

Signal:
${JSON.stringify({ title: signal.title, description: signal.description, category: signal.category })}

Research brief:
${project.researchSummary || "No research summary available."}

Research sources:
${JSON.stringify(project.researchSources || [])}`;

  try {
    const result = await callGemini(prompt);
    const rawScenes = Array.isArray(result.scenes) ? result.scenes : [];
    if (rawScenes.length < 4) throw new Error("Gemini returned too few storyboard scenes.");
    return rawScenes.slice(0, 8).map((scene, index) => normalizeScene(scene, index, length));
  } catch (error) {
    const fallbackEnabled = process.env.GEMINI_STORYBOARD_FALLBACK !== "false";
    if ((error.status === 429 || error.status === 503 || error.status === 502) && fallbackEnabled) {
      console.warn(`[storyboard] Gemini unavailable (${error.message}); using research-backed fallback storyboard.`);
      return buildFallbackStoryboard({ project, signal, length });
    }
    throw error;
  }
}
