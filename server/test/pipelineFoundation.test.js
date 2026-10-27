import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CLASSIC_PIPELINE_DEFINITION, PIPELINE_STAGES, pipelineCatalog, validatePipelineDefinition } from "../src/services/pipelineRegistry.js";
import { activateVersion, getActivePipelineVersion, updateDraft, PipelineProblem } from "../src/services/pipelineService.js";

test("classic pipeline has exactly the ordered required stages", () => {
  const definition = CLASSIC_PIPELINE_DEFINITION;
  assert.deepEqual(definition.stages.map(s => s.key), PIPELINE_STAGES.map(s => s.key));
  assert.equal(validatePipelineDefinition(definition).valid, true);
});
test("unsupported or unintegrated model adapters cannot enter a published pipeline", () => {
  const example = structuredClone(CLASSIC_PIPELINE_DEFINITION);
  example.stages.find(s => s.key === "storyboard").adapterId = "grok-storyboard";
  assert.equal(validatePipelineDefinition(example).valid, false);
  example.stages.find(s => s.key === "storyboard").adapterId = "pexels-stock";
  assert.equal(validatePipelineDefinition(example).valid, false);
  example.stages.find(s => s.key === "storyboard").adapterId = "gemini-storyboard";
  example.stages.reverse();
  assert.equal(validatePipelineDefinition(example).valid, false);
  assert.equal(pipelineCatalog().adapters.find(a => a.id === "grok-tts").available, false);
});
test("stage contracts reject arbitrary keys and removal of mandatory verification", () => {
  const extras = structuredClone(CLASSIC_PIPELINE_DEFINITION);
  extras.stages[0].apiKey = "unsafe";
  assert.equal(validatePipelineDefinition(extras).valid, false);
  const removed = structuredClone(CLASSIC_PIPELINE_DEFINITION);
  removed.stages = removed.stages.filter(s => s.key !== "verification");
  assert.equal(validatePipelineDefinition(removed).valid, false);
});
test("activation changes one global pointer and refuses draft versions", async () => {
  const definition = structuredClone(CLASSIC_PIPELINE_DEFINITION);
  const records = {
    "classic-v1": { id: "classic-v1", pipelineId: "classic", status: "published", definition },
    "candidate-v1": { id: "candidate-v1", pipelineId: "candidate", status: "published", definition },
    "candidate-v2": { id: "candidate-v2", pipelineId: "candidate", status: "draft", definition },
  };
  let active = "classic-v1";
  const audits = [];
  const db = {
    $transaction: callback => callback(db),
    aiPipelineVersion: { findUnique: async ({ where }) => records[where.id] },
    activeAiPipeline: {
      findUnique: async () => ({ id: "global", versionId: active }),
      update: async ({ data }) => { active = data.versionId; },
    },
    adminAuditLog: { create: async ({ data }) => { audits.push(data); } },
  };
  await assert.rejects(() => activateVersion("candidate-v2", "candidate", "admin", db),
    error => error instanceof PipelineProblem && error.status === 409);
  const changed = await activateVersion("candidate-v1", "candidate", "admin", db);
  assert.equal(changed.activeVersionId, "candidate-v1");
  assert.equal(active, "candidate-v1");
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, "pipeline.activated");
  const repeated = await activateVersion("candidate-v1", "candidate", "admin", db);
  assert.equal(repeated.alreadyActive, true);
  assert.equal(audits.length, 1);
});
test("published pipeline versions cannot be edited", async () => {
  const definition = structuredClone(CLASSIC_PIPELINE_DEFINITION);
  const db = {
    $transaction: callback => callback(db),
    aiPipelineVersion: { findUnique: async () => ({ id: "published", pipelineId: "classic", status: "published", definition }) },
  };
  await assert.rejects(() => updateDraft("published", "classic", definition, "admin", db),
    error => error instanceof PipelineProblem && error.status === 409);
});
test("projects pin the active version at creation without reassigning existing projects", () => {
  const signal = readFileSync("src/routes/projects.js", "utf8");
  const conversation = readFileSync("src/routes/researchConversations.js", "utf8");
  assert.match(signal, /pipelineVersionId: pipelineVersion\.id/);
  assert.match(conversation, /pipelineVersionId: pipelineVersion\.id/);
  const migrations = readFileSync("prisma/migrations/20261027180000_ai_pipeline_foundation/migration.sql", "utf8");
  assert.match(migrations, /'voxora-legacy-v1','voxora-legacy',1,'published'/);
  assert.match(migrations, /VALUES \('global','voxora-legacy-v1',NOW\(3\)\)/);
});
test("the pipeline API is nested under existing server-authorized platform admin routes", () => {
  const admin = readFileSync("src/routes/platformAdmin.js", "utf8");
  const app = readFileSync("src/app.js", "utf8");
  assert.match(admin, /router\.use\("\/pipelines", pipelineAdminRouter\)/);
  assert.match(app, /app\.use\("\/api\/platform-admin", requireAuth, requirePlatformAdmin, platformAdminRouter\)/);
});
