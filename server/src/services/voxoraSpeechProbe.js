import { ModelPoolError, resolveModelEndpoint } from "./modelPoolValidation.js";
import { resolveModelCredential } from "./modelPoolCredentials.js";

// Never return or persist a synthesized audio sample or a speaker reference
// in the Model Pool test history. The response is validated in memory only.
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const TEST_TEXT = "Welcome to Voxora. This is an administrator-only speech verification test.";

async function readLimitedJson(response) {
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_RESPONSE_BYTES) throw new Error("Response too large.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing response body.");
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_RESPONSE_BYTES) throw new Error("Response too large.");
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    await reader.cancel().catch(() => {});
  }
}

function validateWavResult(payload, expectedEngine) {
  if (payload?.engine !== expectedEngine || payload.fallback !== false ||
      payload.format !== "wav" || typeof payload.audio_base64 !== "string" ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.audio_base64) ||
      payload.audio_base64.length > MAX_RESPONSE_BYTES) return null;
  const wav = Buffer.from(payload.audio_base64, "base64");
  if (wav.length < 44 || wav.length > MAX_RESPONSE_BYTES ||
      wav.toString("ascii", 0, 4) !== "RIFF" ||
      wav.toString("ascii", 8, 12) !== "WAVE") return null;
  let fmt = null;
  let dataBytes = null;
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const end = offset + 8 + size;
    if (end > wav.length) return null;
    if (id === "fmt " && size >= 16) {
      fmt = { format: wav.readUInt16LE(offset + 8),
        channels: wav.readUInt16LE(offset + 10),
        sampleRate: wav.readUInt32LE(offset + 12),
        bits: wav.readUInt16LE(offset + 22) };
    }
    if (id === "data") dataBytes = size;
    offset = end + (size % 2);
  }
  if (!fmt || fmt.format !== 1 || ![1, 2].includes(fmt.channels) ||
      fmt.bits !== 16 || fmt.sampleRate < 8000 || fmt.sampleRate > 192000 ||
      !dataBytes || dataBytes % (fmt.channels * 2) !== 0) return null;
  const measuredDuration = dataBytes / (fmt.sampleRate * fmt.channels * 2);
  const durationSeconds = Number(payload.duration_seconds);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0.2 || durationSeconds > 30 ||
      measuredDuration < 0.2 || Math.abs(durationSeconds - measuredDuration) > Math.max(0.5, measuredDuration * 0.1)) return null;
  return { durationSeconds: Number(measuredDuration.toFixed(2)),
    sampleRate: fmt.sampleRate, audioBytes: wav.length, engine: expectedEngine };
}

export async function probeVoxoraSpeech(model, dependencies = {}) {
  if (model.provider !== "voxora_tts" || model.hostingType !== "hosted")
    throw new ModelPoolError(409, "This model does not support the Voxora speech probe.");
  const endpoint = resolveModelEndpoint(model);
  const credential = resolveModelCredential(model);
  if (!credential) throw new ModelPoolError(409, "Configure a GPU TTS gateway credential before testing.");
  const engine = model.modelIdentifier;
  const qwen = engine === "qwen3-tts-0.6b";
  if (!qwen && engine !== "kokoro") throw new ModelPoolError(409, "Unknown Voxora TTS engine.");

  const voiceId = String((dependencies.env || process.env).AI_POOL_TTS_TEST_VOICE_ID || "").trim();
  if (qwen && !/^voice_[a-f0-9]{32}$/.test(voiceId))
    throw new ModelPoolError(409, "Configure AI_POOL_TTS_TEST_VOICE_ID for an explicitly authorized administrator-owned test voice.");

  const fetchFn = dependencies.fetchFn || fetch;
  const started = Date.now();
  try {
    const response = await fetchFn(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + credential },
      body: JSON.stringify({
        text: TEST_TEXT,
        engine,
        language: "English",
        ...(qwen ? { voice_id: voiceId } : {}),
        allow_fallback: false,
      }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(120000),
    });
    const latencyMs = Date.now() - started;
    if (!response.ok)
      return { passed: false, latencyMs, result: { code: "UPSTREAM_HTTP", httpStatus: response.status,
        message: "GPU speech gateway rejected the test request." } };
    const data = await readLimitedJson(response);
    const metrics = validateWavResult(data, engine);
    if (!metrics)
      return { passed: false, latencyMs, result: { code: "INVALID_AUDIO",
        message: "Speech response was missing a valid WAV, contained a fallback, or exceeded test limits." } };
    return { passed: true, latencyMs, result: { code: "PASS",
      message: "Authorized speech capability test generated and validated WAV audio.", ...metrics } };
  } catch (error) {
    return { passed: false, latencyMs: Date.now() - started, result: {
      code: "PROBE_ERROR", message: error?.name === "TimeoutError" ?
        "GPU speech probe timed out." : "GPU speech request failed or returned invalid data.",
    } };
  }
}
