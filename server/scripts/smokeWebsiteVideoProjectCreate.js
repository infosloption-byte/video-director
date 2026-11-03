// Run inside the isolated API image (NOT the running API container):
// docker compose -p voxora --env-file .env.lightsail -f docker-compose.lightsail.yml \
//   run --rm --no-deps --entrypoint node api scripts/smokeWebsiteVideoProjectCreate.js
//
// This touches production MySQL inside a single transaction that is
// deliberately rolled back. It never creates a lasting project or signal,
// starts research, sends external requests, or consumes rendering quotas.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { buildWebsiteVideoProjectData } from "../src/services/websiteVideoProjectCreate.js";

if (!process.env.DATABASE_URL) {
  const e = process.env;
  for (const key of ["DB_USERNAME", "DB_PASSWORD", "DB_HOST", "DB_PORT", "DB_DATABASE"]) {
    if (!e[key]) throw new Error("Missing DB env key: " + key);
  }
  process.env.DATABASE_URL = "mysql://" + encodeURIComponent(e.DB_USERNAME) +
    ":" + encodeURIComponent(e.DB_PASSWORD) +
    "@" + e.DB_HOST + ":" + e.DB_PORT + "/" + encodeURIComponent(e.DB_DATABASE);
}

const { prisma } = await import("../src/db/client.js");
const rollback = new Error("ROLLBACK_EXPECTED");
const projectId = crypto.randomUUID();

try {
  const active = await prisma.activeAiPipeline.findUnique({
    where: { id: "global" }, select: { versionId: true },
  });
  assert.ok(active?.versionId, "An active AI pipeline version must exist.");

  try {
    await prisma.$transaction(async tx => {
      const data = buildWebsiteVideoProjectData({
        id: projectId,
        userId: "__website_mvp_rollback_smoke__",
        report: { name: "Voxora smoke test", url: "https://example.org/" },
        idea: { id: "company-introduction", title: "Test marketing video",
          angle: "No advertisement is generated", durationSeconds: 30 },
        brief: {
          executive_summary: "Rollback-only Prisma schema validation.",
          websiteMarketing: { type: "website_marketing" },
          sources: [],
        },
        pipelineVersionId: active.versionId,
      });
      const project = await tx.project.create({
        data, include: { signal: true, pipelineVersion: true },
      });
      assert.equal(project.id, projectId);
      assert.equal(project.signal.category, "WEBSITE_MARKETING");
      assert.equal(project.pipelineVersionId, active.versionId);
      assert.equal(project.pipelineVersion?.id, active.versionId);
      console.log("PROJECT_AND_SIGNAL_CREATE_VALIDATED_IN_ROLLBACK_TRANSACTION");
      throw rollback;
    }, { maxWait: 5000, timeout: 10000 });
    throw new Error("Smoke transaction unexpectedly committed.");
  } catch (err) {
    if (err !== rollback) throw err;
  }

  const left = await prisma.project.findUnique({
    where: { id: projectId }, select: { id: true },
  });
  assert.equal(left, null, "The smoke project must not persist.");
  console.log("ROLLBACK_VERIFIED_NO_PROJECT_PERSISTED");
} finally {
  await prisma.$disconnect();
}
