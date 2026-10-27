import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateModelInput, allowedHostedOrigin, ModelPoolError, defaultModelEndpoint, validateModelEndpoint, resolveModelEndpoint } from "../src/services/modelPoolValidation.js";
import { encryptCredential, decryptCredential, configuredCredential, resolveModelCredential } from "../src/services/modelPoolCredentials.js";
import { safePoolModel } from "../src/services/modelPoolService.js";
import { probeModelCapability } from "../src/services/modelPoolProbe.js";
import { validatePipelineDefinition, CLASSIC_PIPELINE_DEFINITION } from "../src/services/pipelineRegistry.js";

test("strict provider types and capability allowlist", () => {
  const sample = { name: "Cloud Model", hostingType: "cloud", provider: "openai", modelIdentifier: "gpt-4.1-mini", declaredCapabilities: ["research","storyboard"] };
  assert.equal(validateModelInput(sample).provider, "openai");
  assert.equal(validateModelInput({ ...sample, provider: "openrouter", modelIdentifier: "openai/gpt-4o-mini" }).provider, "openrouter");
  assert.throws(() => validateModelInput({ ...sample, provider: "openrouter", hostingType: "hosted" }), ModelPoolError);
  assert.throws(() => validateModelInput({ ...sample, provider: "openrouter", baseUrl: "https://example.com" }), ModelPoolError);
  assert.throws(() => validateModelInput({ ...sample, provider: "invalid" }), ModelPoolError);
  assert.throws(() => validateModelInput({ ...sample, provider: "xai", hostingType: "hosted" }), ModelPoolError);
  assert.throws(() => validateModelInput({ ...sample, declaredCapabilities: ["admin"] }), ModelPoolError);
  assert.throws(() => validateModelInput({ ...sample, apiKey: "token", secret: "leak" }), ModelPoolError);
});
test("OpenRouter can use its server-side environment credential without storing an admin key", () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "example-openrouter-token-private";
  try {
    const model = { provider: "openrouter", hostingType: "cloud", encryptedCredential: null };
    assert.equal(configuredCredential(model), true);
    assert.equal(resolveModelCredential(model), "example-openrouter-token-private");
    const poolView = safePoolModel({ ...model, id: "or-1", name: "OpenRouter test",
      modelIdentifier: "openai/gpt-4o-mini", declaredCapabilities: ["research"],
      enabled: true, revision: 1, tests: [] });
    assert.equal(poolView.credentialConfigured, true);
    assert.ok(!JSON.stringify(poolView).includes("example-openrouter-token-private"));
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test("self-hosted inference requires operator-approved endpoint, without URL credentials", () => {
  const config = { AI_POOL_ALLOWED_ORIGINS: "https://gpu.example.net", AI_POOL_ALLOW_INSECURE_HTTP: "false" };
  assert.equal(allowedHostedOrigin("https://gpu.example.net", config), "https://gpu.example.net");
  for (const uri of ["http://gpu.example.net", "https://gpu.example.net:5555", "https://not-allowed.example.net", "https://username:pass@gpu.example.net", "https://gpu.example.net/private"]) {
    assert.throws(() => allowedHostedOrigin(uri, config), ModelPoolError);
  }
});

test("each cloud provider has a stored, approved, model-specific API endpoint", () => {
  const all = [
    ["openai", "gpt-4.1-mini", "https://api.openai.com/v1/chat/completions"],
    ["xai", "grok-4", "https://api.x.ai/v1/chat/completions"],
    ["openrouter", "openai/gpt-4o-mini", "https://openrouter.ai/api/v1/chat/completions"],
    ["gemini", "gemini-2.5-flash", "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"],
  ];
  for (const [provider, modelIdentifier, endpoint] of all) {
    assert.equal(defaultModelEndpoint(provider, modelIdentifier), endpoint);
    const input = { name: "Example cloud model", hostingType: "cloud", provider,
      modelIdentifier, endpointUrl: endpoint, declaredCapabilities: ["research"] };
    assert.equal(validateModelInput(input).endpointUrl, endpoint);
    assert.equal(resolveModelEndpoint(input), endpoint);
    // Previous Model Pool clients remain compatible while the new UI
    // always supplies endpointUrl explicitly.
    assert.equal(validateModelInput({ ...input, endpointUrl: undefined }).endpointUrl, endpoint);
    assert.throws(() => validateModelInput({ ...input,
      endpointUrl: "https://untrusted.example/steal" }), ModelPoolError);
    assert.throws(() => validateModelInput({ ...input,
      endpointUrl: endpoint + "?key=secret" }), ModelPoolError);
    assert.throws(() => validateModelInput({ ...input,
      endpointUrl: endpoint.replace("https://", "http://") }), ModelPoolError);
  }
  assert.equal(defaultModelEndpoint("gemini", "gemini/pro"), "https://generativelanguage.googleapis.com/v1beta/models/gemini%2Fpro:generateContent");
  assert.throws(() => validateModelEndpoint("openrouter", "cloud",
    "https://openrouter.ai/api/v1/responses", "openai/gpt-4o-mini"), ModelPoolError);
});

test("self-hosted models store a full trusted endpoint URL with a custom API path", () => {
  const configuration = { AI_POOL_ALLOWED_ORIGINS: "https://gpu.example.net:8443", AI_POOL_ALLOW_INSECURE_HTTP: "false" };
  const endpointUrl = "https://gpu.example.net:8443/custom/api/chat/completions";
  const input = { name: "Private GPU model", hostingType: "hosted",
    provider: "openai_compatible", modelIdentifier: "qwen3-local",
    endpointUrl, declaredCapabilities: ["research"] };
  const result = validateModelInput(input, configuration);
  assert.equal(result.endpointUrl, endpointUrl);
  assert.equal(result.baseUrl, "https://gpu.example.net:8443");
  assert.equal(resolveModelEndpoint(result, configuration), endpointUrl);
  for (const value of [
    "https://another.example.net/custom/api/chat/completions",
    "https://gpu.example.net:8443/",
    "https://user:pass@gpu.example.net:8443/custom/api/chat/completions",
    "https://gpu.example.net:8443/custom/api/chat/completions?apiKey=unsafe",
    "https://gpu.example.net:8443/custom/api/chat/completions#secret",
    "http://gpu.example.net:8443/custom/api/chat/completions",
  ]) assert.throws(() => validateModelInput({ ...input, endpointUrl: value }, configuration), ModelPoolError);
  assert.equal(validateModelInput({ ...input, endpointUrl: undefined,
    baseUrl: "https://gpu.example.net:8443" }, configuration).endpointUrl,
    "https://gpu.example.net:8443/v1/chat/completions");
});

test("live capability tests dispatch to the model's saved, permitted endpoint", async () => {
  const previous = process.env.AI_POOL_ALLOWED_ORIGINS;
  process.env.AI_POOL_ALLOWED_ORIGINS = "https://gpu.example.net";
  try {
    const model = { hostingType: "hosted", provider: "openai_compatible",
      baseUrl: "https://gpu.example.net", endpointUrl: "https://gpu.example.net/llm/v1/chat/completions",
      modelIdentifier: "local-model" };
    const report = await probeModelCapability(model, "research", {
      fetchFn: async (url, options) => {
        assert.equal(url, model.endpointUrl);
        assert.equal(options.redirect, "error");
        assert.equal(options.method, "POST");
        return new Response(JSON.stringify({ choices: [{ message: {
          content: JSON.stringify({ summary: "Photosynthesis transforms light energy into stored chemical energy." }),
        } }] }), { status: 200 });
      },
    });
    assert.equal(report.passed, true);
    assert.equal(report.result.code, "PASS");
    await assert.rejects(() => probeModelCapability(
      { ...model, endpointUrl: "https://untrusted.example/api" }, "research", {
        fetchFn: async () => { throw new Error("Must not send request to an untrusted origin."); },
      }), ModelPoolError);
  } finally {
    if (previous === undefined) delete process.env.AI_POOL_ALLOWED_ORIGINS;
    else process.env.AI_POOL_ALLOWED_ORIGINS = previous;
  }
});

test("encrypted keys use authenticated encryption and never appear in model list", () => {
  const old = process.env.AI_POOL_ENCRYPTION_KEY;
  process.env.AI_POOL_ENCRYPTION_KEY = "0123456789abcdef".repeat(4);
  try {
    const ciphertext = encryptCredential("test-secret-for-ai-pool");
    assert.ok(!ciphertext.includes("test-secret-for-ai-pool"));
    assert.equal(decryptCredential(ciphertext), "test-secret-for-ai-pool");
    assert.throws(() => decryptCredential(ciphertext.slice(0, -4) + "AAAA"), ModelPoolError);
    const dto = safePoolModel({ id: "m1", name: "T", provider: "openai", hostingType: "cloud", modelIdentifier: "gpt",
      encryptedCredential: ciphertext, declaredCapabilities: ["research"], enabled: true, revision: 1,
      tests: [{ id: "t1", capability: "research", modelRevision: 1, passed: true, result: { code: "PASS" }, createdAt: new Date() }] });
    assert.equal(dto.verifiedCapabilities[0], "research");
    assert.ok(!JSON.stringify(dto).includes(ciphertext));
    assert.ok(!JSON.stringify(dto).includes("test-secret-for-ai-pool"));
  } finally {
    if (old === undefined) delete process.env.AI_POOL_ENCRYPTION_KEY;
    else process.env.AI_POOL_ENCRYPTION_KEY = old;
  }
});
test("model revision and latest failed tests invalidate stage eligibility", () => {
  const base = { id: "m1", name: "Test", provider: "openai_compatible", hostingType: "hosted",
    baseUrl: "https://gpu.example.net", declaredCapabilities: ["research"], enabled: true, revision: 2, tests: [] };
  const previous = process.env.AI_POOL_ALLOWED_ORIGINS;
  process.env.AI_POOL_ALLOWED_ORIGINS = "https://gpu.example.net";
  try {
    assert.deepEqual(safePoolModel({ ...base, tests: [{ id: "a", capability: "research", modelRevision: 1, passed: true }] }).verifiedCapabilities, []);
    assert.deepEqual(safePoolModel({ ...base, tests: [{ id: "b", capability: "research", modelRevision: 2, passed: false }, { id: "a", capability: "research", modelRevision: 2, passed: true }] }).verifiedCapabilities, []);
    assert.deepEqual(safePoolModel({ ...base, tests: [{ id: "c", capability: "research", modelRevision: 2, passed: true }] }).verifiedCapabilities, ["research"]);
    assert.deepEqual(safePoolModel({ ...base, enabled: false, tests: [{ id: "c", capability: "research", modelRevision: 2, passed: true }] }).verifiedCapabilities, []);
  } finally { if (previous === undefined) delete process.env.AI_POOL_ALLOWED_ORIGINS; else process.env.AI_POOL_ALLOWED_ORIGINS = previous; }
});
test("live research probe verifies actual structured JSON but never returns the generated content", async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key-not-real";
  try {
    const model = { provider: "openai", hostingType: "cloud", modelIdentifier: "gpt-4.1-mini" };
    const good = await probeModelCapability(model, "research", {
      fetchFn: async (url, options) => {
        assert.equal(url, "https://api.openai.com/v1/chat/completions");
        assert.equal(options.redirect, "error");
        assert.equal(options.headers.Authorization, "Bearer test-key-not-real");
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ summary: "Plants convert sunlight into chemical energy in their leaves." }) } }] }), { status: 200 });
      },
    });
    assert.equal(good.passed, true);
    assert.equal(good.result.code, "PASS");
    assert.ok(!JSON.stringify(good).includes("Plants convert sunlight"));
    const bad = await probeModelCapability(model, "storyboard", {
      fetchFn: async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"unknown":true}' } }] }), { status: 200 }),
    });
    assert.equal(bad.passed, false);
    assert.equal(bad.result.code, "INVALID_SCHEMA");
    await assert.rejects(() => probeModelCapability(model, "speech"), ModelPoolError);
  } finally { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; }
});
test("OpenRouter research and storyboard probes use the fixed OpenRouter endpoint and credential", async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-openrouter-key-not-real";
  try {
    const model = {
      provider: "openrouter",
      hostingType: "cloud",
      modelIdentifier: "openai/gpt-4o-mini",
    };
    for (const capability of ["research", "storyboard"]) {
      const output = capability === "research"
        ? { summary: "Photosynthesis converts sunlight and carbon dioxide into chemical energy." }
        : { scenes: [{ narration: "Plants capture sunlight in their leaves.", visualPrompt: "Green leaves illuminated by sunlight." }] };
      const result = await probeModelCapability(model, capability, {
        fetchFn: async (url, options) => {
          assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
          assert.equal(options.method, "POST");
          assert.equal(options.redirect, "error");
          assert.equal(options.headers.Authorization, "Bearer test-openrouter-key-not-real");
          assert.equal(options.headers["Content-Type"], "application/json");
          const body = JSON.parse(options.body);
          assert.equal(body.model, "openai/gpt-4o-mini");
          assert.equal(body.messages[0].role, "user");
          return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify(output) } }],
          }), { status: 200 });
        },
      });
      assert.equal(result.passed, true);
      assert.equal(result.result.code, "PASS");
      assert.ok(!JSON.stringify(result).includes("Photosynthesis converts"));
      assert.ok(!JSON.stringify(result).includes("Plants capture"));
      assert.ok(!JSON.stringify(result).includes("test-openrouter-key"));
    }
    const denied = await probeModelCapability(model, "research", {
      fetchFn: async () => new Response(JSON.stringify({
        error: { message: "Sensitive upstream error content" },
      }), { status: 401 }),
    });
    assert.equal(denied.passed, false);
    assert.equal(denied.result.code, "UPSTREAM_HTTP");
    assert.equal(denied.result.httpStatus, 401);
    assert.ok(!JSON.stringify(denied).includes("Sensitive upstream error"));
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test("verified models are selectable in drafts but blocked from publishing", () => {
  const example = structuredClone(CLASSIC_PIPELINE_DEFINITION);
  example.stages.find(s => s.key === "research").modelId = "pool-m1";
  const models = [{ id: "pool-m1", enabled: true, verifiedCapabilities: ["research"], provider: "openai" }];
  assert.equal(validatePipelineDefinition(example, { allowPlanned: true, modelPool: models }).valid, true);
  assert.equal(validatePipelineDefinition(example, { allowPlanned: true, modelPool: [{ ...models[0], verifiedCapabilities: ["storyboard"] }] }).valid, false);
  assert.equal(validatePipelineDefinition(example, { allowPlanned: false, modelPool: models }).valid, false);
});
test("Model Pool is nested under role-protected Platform Admin API", () => {
  const parent = readFileSync("src/routes/platformAdmin.js", "utf8");
  const app = readFileSync("src/app.js", "utf8");
  assert.match(parent, /router\.use\("\/model-pool", modelPoolRouter\)/);
  assert.match(app, /app\.use\("\/api\/platform-admin", requireAuth, requirePlatformAdmin, platformAdminRouter\)/);
});
