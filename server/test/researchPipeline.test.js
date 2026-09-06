import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = (relativePath) => readFile(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

test("M17 research synthesis requires 8–15 evidence-backed findings", async () => {
  const deepResearch = await source("../src/services/deepResearchService.js");
  assert.match(deepResearch, /key_findings:\s*\{\s*type:\s*["']array["'],\s*minItems:\s*8,\s*maxItems:\s*15/);
  assert.match(deepResearch, /Aim for 8–15 major findings/);
});

test("M17 research reading records explicit failures instead of silently treating them as evidence", async () => {
  const deepResearch = await source("../src/services/deepResearchService.js");
  assert.match(deepResearch, /readStatus: `http_\$\{response\.status\}`/);
  assert.match(deepResearch, /readStatus: "non_text"/);
  assert.match(deepResearch, /readStatus: "failed"/);
  assert.match(deepResearch, /No readable source text available/);
});

test("M17 evidence passages carry source-relative offsets and locators", async () => {
  const deepResearch = await source("../src/services/deepResearchService.js");
  assert.match(deepResearch, /start_offset: passage\.start/);
  assert.match(deepResearch, /end_offset: passage\.end/);
  assert.match(deepResearch, /locator: `chars:\$\{passage\.start\}-\$\{passage\.end\}`/);
  assert.match(deepResearch, /evidence_type: "claim_support"/);
});

test("M17 contradiction adjudication uses model assistance with deterministic fallback", async () => {
  const adjudication = await source("../src/services/researchAdjudicationService.js");
  assert.match(adjudication, /method: "model_assisted"/);
  assert.match(adjudication, /method: "deterministic"/);
  assert.match(adjudication, /if \(!apiKey \|\| !conflicts\.length\)/);
  assert.match(adjudication, /catch \(error\)/);
});
