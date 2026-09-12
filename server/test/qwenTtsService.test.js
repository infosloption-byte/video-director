import assert from "node:assert/strict";
import test from "node:test";

const originalEnabled = process.env.QWEN3_TTS_ENABLED;
const originalUrl = process.env.QWEN3_TTS_URL;

function restoreEnv() {
  if (originalEnabled === undefined) delete process.env.QWEN3_TTS_ENABLED;
  else process.env.QWEN3_TTS_ENABLED = originalEnabled;
  if (originalUrl === undefined) delete process.env.QWEN3_TTS_URL;
  else process.env.QWEN3_TTS_URL = originalUrl;
}

test("Qwen3-TTS fallback is disabled by default", async () => {
  delete process.env.QWEN3_TTS_ENABLED;
  const { isQwen3TtsEnabled } = await import("../src/services/qwenTtsService.js?disabled=1");
  assert.equal(isQwen3TtsEnabled(), false);
  restoreEnv();
});

test("Qwen3-TTS client posts the expected speech request and reads word timing", async () => {
  process.env.QWEN3_TTS_ENABLED = "true";
  process.env.QWEN3_TTS_URL = "http://qwen.test";

  const originalFetch = globalThis.fetch;
  let request = null;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({
      audio_base64: Buffer.from("RIFFWAVE").toString("base64"),
      format: "wav",
      duration_seconds: 1.24,
      word_timestamps: [
        { word: "Helix", start: 0.11, end: 0.42 },
        { word: "fallback", start: 0.43, end: 0.91 },
      ],
      timing_method: "faster-whisper",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const { synthesizeWithQwen } = await import("../src/services/qwenTtsService.js?test=client-v2");
    const result = await synthesizeWithQwen({
      text: "Helix fallback",
      language: "English",
      voice: "Ryan",
      instruct: "Warm documentary narrator.",
    });

    assert.equal(request.url, "http://qwen.test/v1/audio/speech");
    const body = JSON.parse(request.options.body);
    assert.equal(body.input, "Helix fallback");
    assert.equal(body.voice, "Ryan");
    assert.equal(body.language, "English");
    assert.equal(body.response_format, "json");
    assert.equal(result.format, "wav");
    assert.equal(result.voice, "Ryan");
    assert.equal(result.audio.length, 8);
    assert.equal(result.durationSeconds, 1.24);
    assert.equal(result.timingMethod, "faster-whisper");
    assert.deepEqual(result.wordTimestamps, [
      { word: "Helix", start: 0.11, end: 0.42 },
      { word: "fallback", start: 0.43, end: 0.91 },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test("Qwen3-TTS client reports provider errors", async () => {
  process.env.QWEN3_TTS_ENABLED = "true";
  process.env.QWEN3_TTS_URL = "http://qwen.test";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: "model unavailable" }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });

  try {
    const { synthesizeWithQwen } = await import("../src/services/qwenTtsService.js?test=error-v2");
    await assert.rejects(
      () => synthesizeWithQwen({ text: "test" }),
      (error) => error.message === "model unavailable" && error.providerStatus === 503,
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});
