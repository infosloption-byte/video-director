import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateModelInput, allowedHostedOrigin, ModelPoolError } from "../src/services/modelPoolValidation.js";
import { encryptCredential, decryptCredential } from "../src/services/modelPoolCredentials.js";
import { safePoolModel } from "../src/services/modelPoolService.js";
import { probeModelCapability } from "../src/services/modelPoolProbe.js";
import { validatePipelineDefinition, CLASSIC_PIPELINE_DEFINITION } from "../src/services/pipelineRegistry.js";

test("strict provider types and capability allowlist", () => {
  const sample = { name: "Cloud Model", hostingType: "cloud", provider: "openai", modelIdentifier: "gpt-4.1-mini", declaredCapabilities: ["research","storyboard"] };
  assert.equal(validateModelInput(sample).provider, "openai");
  assert.throws(() => validateModelInput({ ...sample, provider: "invalid" }), ModelPoolError);
  assert.throws(() => validateModelInput({ ...sample, provider: "xai", hostingType: "hosted" }), ModelPoolError);
  assert.throws(() => validateModelInput({ ...sample, declaredCapabilities: ["admin"] }), ModelPoolError);
  assert.throws(() => validateModelInput({ ...sample, apiKey: "token", secret: "leak" }), ModelPoolError);
});
test("self-hosted inference requires operator-approved endpoint, without URL credentials", () => {
  const config = { AI_POOL_ALLOWED_ORIGINS: "https://gpu.example.net", AI_POOL_ALLOW_INSECURE_HTTP: "false" };
  assert.equal(allowedHostedOrigin("https://gpu.example.net", config), "https://gpu.example.net");
  for (const uri of ["http://gpu.example.net", "https://gpu.example.net:5555", "https://not-allowed.example.net", "https://username:pass@gpu.example.net", "https://gpu.example.net/private"]) {
    assert.throws(() => allowedHostedOrigin(uri, config), ModelPoolError);
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
