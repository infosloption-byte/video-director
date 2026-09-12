const DEFAULT_URL = "http://127.0.0.1:8000";
const DEFAULT_MODEL = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice";
const DEFAULT_VOICE = "Ryan";
const DEFAULT_LANGUAGE = "Auto";

function getConfig() {
  return {
    enabled: String(process.env.QWEN3_TTS_ENABLED || "false").toLowerCase() === "true",
    url: String(process.env.QWEN3_TTS_URL || DEFAULT_URL).replace(/\/$/, ""),
    model: process.env.QWEN3_TTS_MODEL || DEFAULT_MODEL,
    voice: process.env.QWEN3_TTS_VOICE || DEFAULT_VOICE,
    language: process.env.QWEN3_TTS_LANGUAGE || DEFAULT_LANGUAGE,
    instruct:
      process.env.QWEN3_TTS_VOICE_INSTRUCT ||
      "Warm, clear documentary narrator. Natural pacing, confident, calm, and easy to understand.",
    timeoutMs: Math.max(5_000, Number(process.env.QWEN3_TTS_TIMEOUT_MS || 120_000)),
  };
}

function timeoutSignal(ms) {
  return AbortSignal.timeout(ms);
}

function normalizeError(status, payload) {
  const detail = payload?.error?.message || payload?.detail || payload?.message;
  const message = detail || `Qwen3-TTS returned HTTP ${status}.`;
  const error = new Error(String(message));
  error.providerStatus = status;
  return error;
}

function normalizeWordTimestamps(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && Number.isFinite(Number(item.start)) && Number.isFinite(Number(item.end)))
    .map((item) => ({
      word: String(item.word ?? ""),
      start: Number(Number(item.start).toFixed(3)),
      end: Number(Number(item.end).toFixed(3)),
    }));
}

export function isQwen3TtsEnabled() {
  return getConfig().enabled;
}

export async function synthesizeWithQwen({ text, language, voice, instruct }) {
  const config = getConfig();
  if (!config.enabled) throw new Error("Qwen3-TTS fallback is disabled.");

  const cleanText = String(text || "").trim();
  if (!cleanText) throw new Error("Cannot synthesize an empty scene.");

  const response = await fetch(`${config.url}/v1/audio/speech`, {
    method: "POST",
    signal: timeoutSignal(config.timeoutMs),
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, audio/wav",
    },
    body: JSON.stringify({
      model: config.model,
      input: cleanText,
      voice: voice || config.voice,
      language: language || config.language,
      instruct: instruct || config.instruct,
      response_format: "json",
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw normalizeError(response.status, payload);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => null);
    if (!payload?.audio_base64) throw new Error("Qwen3-TTS returned no audio_base64 payload.");
    const audio = Buffer.from(String(payload.audio_base64), "base64");
    if (!audio.length) throw new Error("Qwen3-TTS returned an empty audio payload.");
    return {
      audio,
      format: payload.format || "wav",
      voice: voice || config.voice,
      language: language || config.language,
      model: payload.model || config.model,
      durationSeconds: Number.isFinite(Number(payload.duration_seconds)) ? Number(payload.duration_seconds) : null,
      wordTimestamps: normalizeWordTimestamps(payload.word_timestamps),
      timingMethod: payload.timing_method || "unknown",
    };
  }

  if (!contentType.includes("audio/")) {
    const payload = await response.text().catch(() => "");
    const error = new Error(payload || `Qwen3-TTS returned an unsupported content type: ${contentType || "unknown"}.`);
    error.providerStatus = response.status;
    throw error;
  }

  const arrayBuffer = await response.arrayBuffer();
  const audio = Buffer.from(arrayBuffer);
  if (!audio.length) throw new Error("Qwen3-TTS returned an empty audio payload.");

  return {
    audio,
    format: "wav",
    voice: voice || config.voice,
    language: language || config.language,
    model: config.model,
    durationSeconds: null,
    wordTimestamps: [],
    timingMethod: "none",
  };
}

export async function checkQwen3TtsHealth() {
  const config = getConfig();
  if (!config.enabled) return { enabled: false, reachable: false, url: config.url };

  try {
    const response = await fetch(`${config.url}/diagnostics`, {
      signal: timeoutSignal(Math.min(config.timeoutMs, 10_000)),
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return { enabled: true, reachable: false, status: response.status, url: config.url };
    return {
      enabled: true,
      reachable: true,
      status: response.status,
      url: config.url,
      diagnostics: payload,
    };
  } catch (error) {
    return { enabled: true, reachable: false, url: config.url, error: error.message };
  }
}
