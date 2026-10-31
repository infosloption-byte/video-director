import test from "node:test";
import assert from "node:assert/strict";
import { validateModelInput, ModelPoolError, resolveModelEndpoint } from "../src/services/modelPoolValidation.js";
import { probeModelCapability } from "../src/services/modelPoolProbe.js";
import { safePoolModel } from "../src/services/modelPoolService.js";

const endpoint = "http://172.31.64.234:8000/v1/audio/speech";
const original = {};
const vars = ["AI_POOL_ALLOWED_ORIGINS", "AI_POOL_ALLOW_INSECURE_HTTP", "GPU_TTS_AUTH_TOKEN", "AI_POOL_TTS_TEST_VOICE_ID"];

function envSetup() {
  for (const key of vars) original[key] = process.env[key];
  process.env.AI_POOL_ALLOWED_ORIGINS = "http://172.31.64.234:8000";
  process.env.AI_POOL_ALLOW_INSECURE_HTTP = "true";
  process.env.GPU_TTS_AUTH_TOKEN = "test-only-private-gateway-token";
}
function envRestore() {
  for (const key of vars) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
}
function model(engine = "kokoro") {
  return { name: "Voxora GPU TTS", provider: "voxora_tts",
    hostingType: "hosted", modelIdentifier: engine, endpointUrl: endpoint,
    enabled: true, declaredCapabilities: ["speech"] };
}
function wavBase64() {
  const wav = Buffer.alloc(48);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(40, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24);
  wav.writeUInt32LE(48000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(4, 40);
  return wav.toString("base64");
}

test("Voxora hosted speech must use the exact allowlisted TTS endpoint and supported engines", () => {
  envSetup();
  try {
    assert.equal(validateModelInput(model()).endpointUrl, endpoint);
    assert.equal(resolveModelEndpoint(model()), endpoint);
    for (const invalid of [
      { ...model(), endpointUrl: "http://172.31.64.234:8000/diagnostics" },
      { ...model(), endpointUrl: "http://example.com/v1/audio/speech" },
      { ...model(), endpointUrl: endpoint + "?token=secret" },
      { ...model(), modelIdentifier: "untrusted" },
      { ...model(), declaredCapabilities: ["research", "speech"] },
    ]) assert.throws(() => validateModelInput(invalid), ModelPoolError);
    process.env.AI_POOL_ALLOW_INSECURE_HTTP = "false";
    assert.throws(() => validateModelInput(model()), ModelPoolError);
  } finally { envRestore(); }
});

test("speech probe sends only a fixed admin sentence and reports verified WAV metadata, never audio", async () => {
  envSetup();
  try {
    const b64 = wavBase64();
    const result = await probeModelCapability(model(), "speech", {
      fetchFn: async (url, opts) => {
        assert.equal(url, endpoint);
        assert.equal(opts.method, "POST");
        assert.equal(opts.redirect, "error");
        assert.equal(opts.headers.Authorization, "Bearer test-only-private-gateway-token");
        const body = JSON.parse(opts.body);
        assert.equal(body.engine, "kokoro");
        assert.equal(body.voice_id, undefined);
        assert.equal(body.allow_fallback, false);
        assert.match(body.text, /administrator-only/);
        return new Response(JSON.stringify({
          engine: "kokoro", fallback: false, format: "wav", audio_base64: b64,
          duration_seconds: 1.1,
        }), { status: 200 });
      },
    });
    assert.equal(result.passed, true);
    assert.equal(result.result.sampleRate, 24000);
    assert.equal(result.result.audioBytes, 48);
    assert.ok(!JSON.stringify(result).includes(b64));
    const view = safePoolModel({ ...model(), id: "test", revision: 1, tests: [
      { id: "t", capability: "speech", passed: true, modelRevision: 1,
        result: result.result, latencyMs: 99, createdAt: new Date() },
    ] });
    assert.deepEqual(view.verifiedCapabilities, ["speech"]);
  } finally { envRestore(); }
});

test("speech tests reject fallback audio and upstream errors without leaking audio or provider message", async () => {
  envSetup();
  try {
    const fallback = await probeModelCapability(model(), "speech", {
      fetchFn: async () => new Response(JSON.stringify({
        engine: "kokoro", fallback: true, format: "wav",
        duration_seconds: 1, audio_base64: wavBase64(),
      }), { status: 200 }),
    });
    assert.equal(fallback.passed, false);
    assert.equal(fallback.result.code, "INVALID_AUDIO");
    const bad = await probeModelCapability(model(), "speech", {
      fetchFn: async () => new Response(JSON.stringify({ detail: "Sensitive upstream server data" }), { status: 503 }),
    });
    assert.equal(bad.passed, false);
    assert.equal(bad.result.httpStatus, 503);
    assert.ok(!JSON.stringify(bad).includes("Sensitive upstream server data"));
  } finally { envRestore(); }
});

test("Qwen speech tests require an explicit operator-owned authorized test voice", async () => {
  envSetup();
  try {
    await assert.rejects(() => probeModelCapability(model("qwen3-tts-0.6b"), "speech", {
      fetchFn: async () => { throw new Error("Should not contact GPU without an approved voice."); },
    }), ModelPoolError);
    process.env.AI_POOL_TTS_TEST_VOICE_ID = "voice_" + "a".repeat(32);
    const result = await probeModelCapability(model("qwen3-tts-0.6b"), "speech", {
      fetchFn: async (_url, opts) => {
        assert.equal(JSON.parse(opts.body).voice_id, process.env.AI_POOL_TTS_TEST_VOICE_ID);
        return new Response(JSON.stringify({
          engine: "qwen3-tts-0.6b", fallback: false, format: "wav",
          duration_seconds: 1.4, audio_base64: wavBase64(),
        }), { status: 200 });
      },
    });
    assert.equal(result.passed, true);
    await assert.rejects(() => probeModelCapability(
      { ...model(), provider: "openai_compatible" }, "speech",
      { fetchFn: async () => { throw new Error("Unexpected fetch"); } },
    ), ModelPoolError);
  } finally { envRestore(); }
});
