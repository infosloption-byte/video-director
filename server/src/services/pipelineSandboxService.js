import { prisma } from "../db/client.js";
import { PIPELINE_ADAPTERS, PIPELINE_STAGES, validatePipelineDefinition, definitionHash } from "./pipelineRegistry.js";
import { PipelineProblem } from "./pipelineService.js";
import { getEligiblePoolModels } from "./modelPoolService.js";

// This harness exercises a safe, deterministic fixture for every stage.
// It NEVER contacts external providers, processes customer data, modifies
// production projects, reserves render credits, or generates real media.
const FIXTURES = Object.freeze({
  topic: { input: ["topic"], output: ["normalizedTopic"] },
  sources: { input: ["normalizedTopic"], output: ["sourceCandidates"] },
  research: { input: ["sourceCandidates"], output: ["researchBrief"] },
  verification: { input: ["researchBrief"], output: ["verifiedBrief"] },
  storyboard: { input: ["verifiedBrief"], output: ["scenes"] },
  visuals: { input: ["scenes"], output: ["visualAssets"] },
  speech: { input: ["scenes"], output: ["narrationAssets"] },
  render: { input: ["visualAssets", "narrationAssets"], output: ["renderManifest"] },
  export: { input: ["renderManifest"], output: ["exportManifest"] },
});
const adapterById = new Map(PIPELINE_ADAPTERS.map(adapter => [adapter.id, adapter]));

export function simulatePipeline(definition, { modelPool = [] } = {}) {
  const validation = validatePipelineDefinition(definition, { allowPlanned: true, modelPool });
  const state = { topic: "Admin-only test topic: how solar cells generate electricity" };
  const stages = [];
  for (const [index, stage] of PIPELINE_STAGES.entries()) {
    const selection = definition?.stages?.[index];
    const adapter = adapterById.get(selection?.adapterId);
    const fixture = FIXTURES[stage.key];
    const problems = [];
    if (!selection || selection.key !== stage.key) problems.push("Required stage is missing or out of order.");
    if (!adapter || adapter.capability !== stage.key) problems.push("Adapter capability mismatch.");
    else if (!adapter.available) problems.push("Provider adapter is not implemented.");
    for (const input of fixture.input) {
      if (!Object.hasOwn(state, input)) problems.push("Missing required upstream input: " + input);
    }
    if (selection?.modelId) {
      const selected = modelPool.find(model => model.id === selection.modelId);
      if (!selected || !selected.enabled || !selected.verifiedCapabilities.includes(stage.key))
        problems.push("Selected Model Pool model has no current passing capability test.");
    }
    const passed = problems.length === 0;
    if (passed) for (const field of fixture.output) state[field] = "fixture:" + stage.key + ":" + field;
    stages.push({
      stage: stage.key, label: stage.label, position: index + 1, adapterId: selection?.adapterId || null,
      status: passed ? "passed" : "failed", inputFields: fixture.input, outputFields: passed ? fixture.output : [],
      modelId: selection?.modelId || null,
      notes: passed ? ["Simulated input/output contract checked. No AI or external provider called.",
        ...(selection?.modelId ? ["Model Pool assignment is preview-only and has not been dispatched as a pipeline execution."] : [])] : problems,
    });
  }
  const errors = [...validation.errors, ...stages.flatMap(step => step.status === "failed" ? step.notes.map(note => step.stage + ": " + note) : [])];
  return {
    mode: "configuration_simulation", safeSandbox: true, actualProviderCalls: 0, workspaceMutations: 0,
    passed: validation.valid && stages.every(step => step.status === "passed"),
    definitionHash: definitionHash(definition),
    stages, errors: [...new Set(errors)], warnings: validation.warnings,
    summary: {
      checkedStages: stages.length, passedStages: stages.filter(x => x.status === "passed").length,
      failedStages: stages.filter(x => x.status === "failed").length,
    },
  };
}
export async function runPipelineSandbox(pipelineId, versionId, actorUserId, db = prisma) {
  const version = await db.aiPipelineVersion.findUnique({ where: { id: versionId },
    select: { id: true, pipelineId: true, definition: true } });
  if (!version || version.pipelineId !== pipelineId) throw new PipelineProblem(404, "Pipeline version not found.");
  const modelPool = version.definition?.stages?.some(stage => stage?.modelId) ? await getEligiblePoolModels(db) : [];
  const report = simulatePipeline(version.definition, { modelPool });
  const saved = await db.aiPipelineSandboxTest.create({
    data: {
      pipelineVersionId: versionId, actorUserId, definitionHash: report.definitionHash,
      passed: report.passed, report,
    },
    select: { id: true, definitionHash: true, passed: true, createdAt: true, report: true },
  });
  return { test: saved, note: "Simulation only; provider connectivity and media quality are not tested." };
}
export async function pipelineSandboxHistory(pipelineId, versionId, db = prisma) {
  const version = await db.aiPipelineVersion.findUnique({ where: { id: versionId },
    select: { id: true, pipelineId: true, definition: true } });
  if (!version || version.pipelineId !== pipelineId) throw new PipelineProblem(404, "Pipeline version not found.");
  const tests = await db.aiPipelineSandboxTest.findMany({
    where: { pipelineVersionId: versionId }, orderBy: { createdAt: "desc" }, take: 15,
    select: { id: true, passed: true, definitionHash: true, createdAt: true, report: true },
  });
  const hash = definitionHash(version.definition);
  return { definitionHash: hash, tests: tests.map(test => ({ ...test, current: test.definitionHash === hash })) };
}
