import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CLASSIC_PIPELINE_DEFINITION, definitionHash, validatePipelineDefinition } from "../src/services/pipelineRegistry.js";
import { simulatePipeline, runPipelineSandbox, pipelineSandboxHistory } from "../src/services/pipelineSandboxService.js";
import { PipelineProblem, publishVersion, updateDraft } from "../src/services/pipelineService.js";

test("existing Classic pipeline passes all deterministic admin contracts without generation", () => {
  const report = simulatePipeline(CLASSIC_PIPELINE_DEFINITION);
  assert.equal(report.mode, "configuration_simulation");
  assert.equal(report.passed, true);
  assert.equal(report.stages.length, 9);
  assert.equal(report.summary.passedStages, 9);
  assert.equal(report.actualProviderCalls, 0);
  assert.equal(report.workspaceMutations, 0);
  assert.equal(report.safeSandbox, true);
  assert.equal(report.errors.length, 0);
});
test("planned Grok can be saved in drafts, but cannot pass sandbox or publish", () => {
  const draft = structuredClone(CLASSIC_PIPELINE_DEFINITION);
  draft.stages.find(s => s.key === "storyboard").adapterId = "grok-storyboard";
  assert.equal(validatePipelineDefinition(draft, { allowPlanned: true }).valid, true);
  assert.equal(validatePipelineDefinition(draft).valid, false);
  const result = simulatePipeline(draft);
  assert.equal(result.passed, false);
  assert.equal(result.stages.find(s => s.stage === "storyboard").status, "failed");
  assert.ok(result.errors.some(s => s.includes("not implemented")));
});
test("canonical fingerprints are insensitive to object field ordering", () => {
  const a = structuredClone(CLASSIC_PIPELINE_DEFINITION);
  const b = { stages: a.stages.map(s => ({ adapterId: s.adapterId, key: s.key })), schemaVersion: 1 };
  assert.equal(definitionHash(a), definitionHash(b));
});
test("sandbox result persists only to admin test history and stale fingerprints can be identified", async () => {
  const definition = structuredClone(CLASSIC_PIPELINE_DEFINITION);
  const rows = [];
  const db = {
    aiPipelineVersion: { findUnique: async () => ({ id: "v1", pipelineId: "p1", definition }) },
    aiPipelineSandboxTest: {
      create: async ({ data }) => { rows.push({ id: "run1", createdAt: new Date(), ...data }); return rows[0]; },
      findMany: async () => rows,
    },
  };
  const outcome = await runPipelineSandbox("p1", "v1", "admin1", db);
  assert.equal(outcome.test.passed, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actorUserId, "admin1");
  assert.equal(rows[0].report.actualProviderCalls, 0);
  const history = await pipelineSandboxHistory("p1", "v1", db);
  assert.equal(history.tests[0].current, true);
  definition.stages[4].adapterId = "grok-storyboard";
  const changed = await pipelineSandboxHistory("p1", "v1", db);
  assert.equal(changed.tests[0].current, false);
});
test("publish requires an exact passing saved-definition test", async () => {
  const definition = structuredClone(CLASSIC_PIPELINE_DEFINITION);
  const version = { id: "v1", pipelineId: "p1", version: 1, status: "draft", definition };
  let currentTest = null;
  const audit = [];
  const db = {
    $transaction: callback => callback(db),
    aiPipelineVersion: {
      findUnique: async () => version,
      updateMany: async ({ data }) => { Object.assign(version, data); return { count: 1 }; },
    },
    aiPipelineSandboxTest: { findFirst: async () => currentTest },
    adminAuditLog: { create: async ({ data }) => audit.push(data) },
  };
  await assert.rejects(() => publishVersion("v1", "p1", "admin", db),
    e => e instanceof PipelineProblem && e.status === 409);
  currentTest = { id: "passed" };
  const result = await publishVersion("v1", "p1", "admin", db);
  assert.equal(result.versionId, "v1");
  assert.equal(version.status, "published");
  assert.equal(audit.length, 1);
});
test("only backend-protected admin API allows sandbox execution", () => {
  const app = readFileSync("src/app.js", "utf8");
  const routes = readFileSync("src/routes/adminPipelines.js", "utf8");
  assert.match(app, /app\.use\("\/api\/platform-admin", requireAuth, requirePlatformAdmin, platformAdminRouter\)/);
  assert.match(routes, /router\.post\("\/:pipelineId\/versions\/:versionId\/sandbox-tests"/);
  assert.match(routes, /router\.get\("\/:pipelineId\/versions\/:versionId\/sandbox-tests"/);
});
