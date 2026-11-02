import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateGpuSample } from "../src/services/infrastructureMonitoring.js";
import { summarizeProjectEconomics } from "../src/services/generationEconomicsService.js";
import { normalizeTrace } from "../src/services/generationTelemetry.js";

const read = path => readFile(new URL("../src/" + path, import.meta.url), "utf8");
const now = new Date("2026-11-02T12:30:00.000Z");

test("GPU sample accepts a current bounded numerical snapshot", () => {
  const value = validateGpuSample({
    collectedAt: now.toISOString(), gpuPct: 88,
    vramUsedBytes: 1024, vramTotalBytes: 2048, temperatureC: 65,
  }, now);
  assert.equal(value.host, "gpu-ec2");
  assert.equal(value.gpuPct, 88);
  assert.equal(value.vramUsedBytes, 1024n);
  assert.equal(value.temperatureC, 65);
  assert.equal(value.source, "nvidia-smi");
});
test("invalid GPU timestamp, VRAM and percentage are rejected", () => {
  const valid = { collectedAt: now.toISOString(), gpuPct: 80, vramUsedBytes: 500, vramTotalBytes: 900 };
  assert.throws(() => validateGpuSample({ ...valid, gpuPct: -1 }, now), /GPU readings/);
  assert.throws(() => validateGpuSample({ ...valid, vramUsedBytes: 901 }, now), /GPU readings/);
  assert.throws(() => validateGpuSample({ ...valid, collectedAt: "2025-11-02" }, now), /timestamp/);
  assert.throws(() => validateGpuSample({ ...valid, gpuPct: "bad" }, now), /GPU readings/);
});
test("unknown provider spend and billed revenue must stay unknown", () => {
  const projects = [{ id: "p", userId: "u", durationSeconds: 60, renderUrl: "/mp4", title: "Test" }];
  const traces = [{ projectId: "p", operation: "render.remotion", durationMs: 3600000, costUsd: null }];
  const result = summarizeProjectEconomics(projects, traces, [{ userId: "u", plan: "creator" }], {
    renderHourlyRate: 0.5,
  });
  assert.equal(result.projects[0].verifiedProviderCostUsd, null);
  assert.equal(result.projects[0].estimatedComputeAllocationUsd, 0.5);
  assert.equal(result.projects[0].billedRevenueUsd, null);
  assert.equal(result.projects[0].marginUsd, null);
  assert.equal(result.totals.operationsWithoutVerifiedCost, 1);
  assert.equal(result.plans[0].plan, "creator");
});
test("compute estimates do not double count overlapping render substeps", () => {
  const projects = [{ id: "p", userId: "u", durationSeconds: 120, renderUrl: "yes" }];
  const traces = [
    { projectId: "p", operation: "render.remotion", durationMs: 7200000, costUsd: null },
    { projectId: "p", operation: "render.remotion_media", durationMs: 7000000, costUsd: null },
    { projectId: "p", operation: "render.frames_elapsed_milestone", durationMs: 5000000, costUsd: null },
    { projectId: "p", operation: "research.full", durationMs: 3600000, costUsd: 0.02 },
  ];
  const result = summarizeProjectEconomics(projects, traces, [], {
    renderHourlyRate: 0.2, researchHourlyRate: 0.1,
  });
  assert.equal(result.totals.estimatedComputeAllocationUsd, 0.5);
  assert.equal(result.totals.verifiedProviderCostUsd, 0.02);
  assert.equal(result.totals.verifiedCostOperations, 1);
});
test("Gemini provider token counts can be recorded without claiming a price", () => {
  const value = normalizeTrace({
    stage: "research", operation: "gemini.generate_content", status: "completed",
    provider: "gemini", model: "gemini-2.5-flash",
    startedAt: now, finishedAt: now, inputTokens: 5000, outputTokens: 900,
  });
  assert.equal(value.inputTokens, 5000);
  assert.equal(value.outputTokens, 900);
  assert.equal(value.costUsd, null);
});
test("Gemini, TTS and Remotion integrations record measured substeps", async () => {
  const [deep, speech, render, research] = await Promise.all([
    read("services/deepResearchService.js"), read("services/ttsService.js"),
    read("services/renderService.js"), read("routes/projects.js"),
  ]);
  assert.match(deep, /usageMetadata\?\.promptTokenCount/);
  assert.match(deep, /gemini\.generate_content/);
  for (const name of ["narration.tts_inference", "narration.wav_to_mp3"]) assert.ok(speech.includes(name));
  for (const name of ["render.asset_preparation", "render.bundle", "render.composition", "render.remotion_media",
    "render.frames_elapsed_milestone", "render.encoding_elapsed_milestone", "render.mux_observed"]) assert.ok(render.includes(name));
  assert.match(research, /observePhase\(stage\)/);
});
test("GPU intake uses a separate constant-time bearer gate and is disabled without a token", async () => {
  const [route, app, compose] = await Promise.all([
    read("routes/gpuTelemetry.js"), read("app.js"),
    readFile(new URL("../../docker-compose.lightsail.yml", import.meta.url), "utf8"),
  ]);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /expected\.length < 32/);
  assert.match(route, /validateGpuSample/);
  assert.match(app, /"\/api\/internal\/telemetry\/gpu", receiveGpuTelemetry/);
  assert.match(compose, /GPU_TELEMETRY_INGEST_TOKEN/);
});
