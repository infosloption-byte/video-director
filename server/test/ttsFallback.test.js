import assert from "node:assert/strict";
import test from "node:test";

const originalEnabled = process.env.QWEN3_TTS_ENABLED;
const originalElevenKey = process.env.ELEVENLABS_API_KEY;

function restoreEnv() {
  if (originalEnabled === undefined) delete process.env.QWEN3_TTS_ENABLED;
  else process.env.QWEN3_TTS_ENABLED = originalEnabled;
  if (originalElevenKey === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = originalElevenKey;
}

test("TTS falls back to Qwen when ElevenLabs returns quota/rate-limit failure", async () => {
  process.env.QWEN3_TTS_ENABLED = "true";
  process.env.ELEVENLABS_API_KEY = "test-key";

  const { synthesizeSpeech } = await import("../src/services/ttsService.js?fallback=success");
  const calls = [];

  try {
    const result = await synthesizeSpeech(
      { projectId: "project-1", sceneId: "scene-1", text: "Fallback narration" },
      {
        elevenLabs: async () => {
          calls.push("elevenlabs");
          const error = new Error("This request exceeds your quota.");
          error.providerStatus = 401;
          throw error;
        },
        qwen: async () => {
          calls.push("qwen3-tts");
          return {
            provider: "qwen3-tts",
            fallback: true,
            voiceId: "Ryan",
            audioUrl: "/api/audio/project-1/scenes/scene-1.mp3",
            wordTimestamps: [
              { word: "Fallback", start: 0.12, end: 0.48 },
              { word: "narration", start: 0.49, end: 1.02 },
            ],
            durationSeconds: 1.02,
            timingMethod: "faster-whisper",
          };
        },
      },
    );

    assert.deepEqual(calls, ["elevenlabs", "qwen3-tts"]);
    assert.equal(result.provider, "qwen3-tts");
    assert.equal(result.fallback, true);
    assert.equal(result.timingMethod, "faster-whisper");
    assert.equal(result.wordTimestamps.length, 2);
  } finally {
    restoreEnv();
  }
});

test("TTS reports both provider failures when fallback also fails", async () => {
  process.env.QWEN3_TTS_ENABLED = "true";
  process.env.ELEVENLABS_API_KEY = "test-key";

  const { synthesizeSpeech } = await import("../src/services/ttsService.js?fallback=error");

  try {
    await assert.rejects(
      () => synthesizeSpeech(
        { projectId: "project-1", sceneId: "scene-2", text: "Fallback failure" },
        {
          elevenLabs: async () => {
            const error = new Error("quota exceeded");
            error.providerStatus = 429;
            throw error;
          },
          qwen: async () => {
            const error = new Error("Qwen model unavailable");
            error.providerStatus = 503;
            throw error;
          },
        },
      ),
      /ElevenLabs: quota exceeded\. Qwen3-TTS: Qwen model unavailable/,
    );
  } finally {
    restoreEnv();
  }
});

test("TTS diagnostics expose provider order without secrets", async () => {
  process.env.QWEN3_TTS_ENABLED = "true";
  process.env.ELEVENLABS_API_KEY = "test-secret";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url, "http://127.0.0.1:8000/diagnostics");
    return new Response(JSON.stringify({
      service: "qwen3-tts",
      status: "ok",
      subtitleTiming: { enabled: true, method: "faster-whisper-word-timestamps" },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const { getTtsDiagnostics } = await import("../src/services/ttsService.js?diagnostics=1");
    const result = await getTtsDiagnostics();
    assert.deepEqual(result.providerOrder, ["elevenlabs", "qwen3-tts"]);
    assert.equal(result.elevenLabs.configured, true);
    assert.equal(result.elevenLabs.voiceConfigured, false);
    assert.equal(result.qwen3Tts.reachable, true);
    assert.equal(result.qwen3Tts.diagnostics.subtitleTiming.enabled, true);
    assert.equal("apiKey" in result.elevenLabs, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});
