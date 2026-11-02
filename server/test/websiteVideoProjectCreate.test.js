import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";

// Regression for the live 500: Unknown argument pipelineVersionId when the
// project is created with nested signal.create. This checked Prisma input must
// connect the relation, not pass the raw FK scalar.
test("website project creation uses checked Prisma relation input for its pipeline", async () => {
  const model = Prisma.dmmf.datamodel.models.find(m => m.name === "Project");
  assert.ok(model, "Generated Prisma client must include Project");
  const relation = model.fields.find(f => f.name === "pipelineVersion");
  assert.equal(relation?.kind, "object");
  assert.deepEqual(relation?.relationFromFields, ["pipelineVersionId"]);

  const path = new URL("../src/routes/websiteAnalyses.js", import.meta.url);
  const route = await readFile(path, "utf8");
  assert.match(route, /signal:\s*\{\s*create:\s*\{/);
  assert.match(route, /pipelineVersion:\s*\{\s*connect:\s*\{\s*id:\s*pipeline\.id\s*\}\s*\}/);
  assert.doesNotMatch(route, /pipelineVersionId\s*:\s*pipeline\.id/);
  assert.match(route, /const pipeline = await getActivePipelineVersion\(\)/);
  assert.match(route, /persistResearchGraph\(created\.id, brief\)/);
  assert.match(route, /status:\s*"completed", stage:\s*"Video workspace ready"/);
});

test("new and reused website videos return the same valid Setup navigation", async () => {
  const path = new URL("../src/routes/websiteAnalyses.js", import.meta.url);
  const route = await readFile(path, "utf8");
  assert.match(route, /if \(prior\) return res\.json\(\{ projectId: prior\.projectId, path: "\/storyboard\/" \+ prior\.projectId \+ "\?stage=setup", reused: true \}\)/);
  assert.match(route, /res\.status\(201\)\.json\(\{ projectId: created\.id, path: "\/storyboard\/" \+ created\.id \+ "\?stage=setup" \}\)/);
});

test("Prisma failure logging does not print the full website research payload", async () => {
  const path = new URL("../src/routes/websiteAnalyses.js", import.meta.url);
  const route = await readFile(path, "utf8");
  assert.doesNotMatch(route, /Video project creation failed", error\?\.code \|\| error\?\.message/);
  assert.match(route, /UNEXPECTED_CREATE_ERROR/);
});
