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
  const { isQwen3TtsEnabled } = await import("../src/services/qwenTtsService.js");
  assert.equal(isQwen3TtsEnabled(), false);
  restoreEnv();
});

test("Qwen3-TTS client posts the expected speech request", async () => {
  process.env.QWEN3_TTS_ENABLED = "true";
  process.env.QWEN3_TTS_URL = "http://qwen.test";

  const originalFetch = globalThis.fetch;
  let request = null;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(new Uint8Array([82, 73, 70, 70, 87, 65, 86, 69]), {
      status: 200,
      headers: { "content-type": "audio/wav" },
    });
  };

  try {
    const { synthesizeWithQwen } = await import("../src/services/qwenTtsService.js?test=client");
    const result = await synthesizeWithQwen({
      text: "Helix narration fallback test.",
      language: "English",
      voice: "Ryan",
      instruct: "Warm documentary narrator.",
    });

    assert.equal(request.url, "http://qwen.test/v1/audio/speech");
    const body = JSON.parse(request.options.body);
    assert.equal(body.input, "Helix narration fallback test.");
    assert.equal(body.voice, "Ryan");
    assert.equal(body.language, "English");
    assert.equal(body.response_format, "wav");
    assert.equal(result.format, "wav");
    assert.equal(result.voice, "Ryan");
    assert.equal(result.audio.length, 8);
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
    const { synthesizeWithQwen } = await import("../src/services/qwenTtsService.js?test=error");
    await assert.rejects(
      () => synthesizeWithQwen({ text: "test" }),
      (error) => error.message === "model unavailable" && error.providerStatus === 503,
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});
