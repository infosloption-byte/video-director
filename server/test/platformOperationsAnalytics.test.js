import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTrace } from "../src/services/generationTelemetry.js";
import { classifyProjectOperation } from "../src/middleware/generationMetrics.js";
import { reportWindow } from "../src/services/platformAnalyticsService.js";
import { readFile } from "node:fs/promises";

const example = {
  projectId: "project-1", userId: "user-1",
  stage: "narration", operation: "narration.generate", status: "completed",
  startedAt: new Date("2026-11-02T12:00:00.000Z"),
  finishedAt: new Date("2026-11-02T12:00:03.250Z"),
};
test("operation metrics calculate real elapsed duration and keep unknown cost null", () => {
  const row = normalizeTrace(example);
  assert.equal(row.durationMs, 3250);
  assert.equal(row.costUsd, null);
  assert.equal(row.costSource, null);
});
test("unverified costs cannot be presented as actual spend", () => {
  assert.throws(() => normalizeTrace({ ...example, costUsd: 0.04 }), /verifiable/);
  assert.equal(normalizeTrace({ ...example, costUsd: 0.04, costSource: "provider_reported" }).costUsd, 0.04);
  assert.throws(() => normalizeTrace({ ...example, costUsd: -1, costSource: "provider_reported" }), /Invalid cost/);
});
test("telemetry excludes prompts, voice identifiers, tokens and raw errors from metadata", () => {
  const row = normalizeTrace({ ...example, metadata: {
    apiKey: "SECRET", prompt: "Confidential text", voiceId: "voice-1",
    errorMessage: "Sensitive provider error", sceneCount: 5,
  } });
  assert.deepEqual(row.metadata, { sceneCount: 5 });
});
test("timestamps, status and stage are validated", () => {
  assert.throws(() => normalizeTrace({ ...example, finishedAt: new Date("2026-01-01") }), /timestamps/);
  assert.throws(() => normalizeTrace({ ...example, status: "pending" }), /status/);
  assert.throws(() => normalizeTrace({ ...example, stage: "bad_stage" }), /stage/);
});
test("workflow request instrumentation is limited to relevant POST routes", () => {
  assert.deepEqual(
    ["/abc/generate-scenes", "/abc/generate-voice", "/abc/render", "/abc/setup"].map(p =>
      classifyProjectOperation("POST", p)?.operation
    ), ["storyboard.generate", "narration.generate", "render.enqueue", "project.setup"]
  );
  assert.equal(classifyProjectOperation("GET", "/abc/render"), null);
  assert.equal(classifyProjectOperation("POST", "/abc/missing"), null);
  assert.equal(classifyProjectOperation("POST", "/abc/any/private-data"), null);
});
test("report windows are restricted to supported date ranges", () => {
  assert.equal(reportWindow(7).days, 7);
  assert.equal(reportWindow(90).days, 90);
  assert.equal(reportWindow(1800).days, 30);
});
test("admin analytics are guarded by platform-admin middleware", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const platform = await readFile(new URL("../src/routes/platformAdmin.js", import.meta.url), "utf8");
  assert.match(app, /"\/api\/platform-admin", requireAuth, requirePlatformAdmin/);
  assert.match(platform, /router.use\("\/analytics", analyticsRouter\)/);
  assert.match(platform, /no-store, private/);
});
test("admin activity combines historical sources rather than relying only on projectActivity", async () => {
  const activity = await readFile(new URL("../src/services/platformActivityService.js", import.meta.url), "utf8");
  for (const source of ["projectActivity", "generationTrace", "researchSession", "adminAuditLog", "renderCredit"]) {
    assert.ok(activity.includes("prisma." + source), "Missing " + source);
  }
});
test("project and account deletion explicitly purge analytics traces", async () => {
  for (const path of ["../src/routes/account.js", "../src/routes/projectDelete.js"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /generationTrace\.deleteMany/);
  }
});
