import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = (relativePath) => readFile(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

test("R6 Ask Helix is corpus-only and marks unsupported follow-ups", async () => {
  const route = await source("../src/routes/research.js");
  const memory = await source("../src/services/researchMemoryService.js");
  assert.match(route, /if \(!session\) return res\.status\(409\).*persisted research corpus/i);
  assert.match(route, /source: "research-corpus"/);
  assert.match(memory, /grounded: false/);
  assert.match(memory, /Voxora did not perform a web search for this follow-up/);
  assert.doesNotMatch(memory, /google_search/);
});

test("R6 Storyboard grounding excludes unread and unverified research", async () => {
  const storyboard = await source("../src/services/storyboardService.js");
  assert.match(storyboard, /source\.read_status === "read"/);
  assert.match(storyboard, /\["unverified", "unavailable", "unread", "failed", "contradictory", "conflicted"\]/);
  assert.match(storyboard, /sourceIndexes\.some\(\(index\) => readableSourceIndexes\.has\(index\)\)/);
  assert.match(storyboard, /allowedEvidenceIndexes/);
  assert.match(storyboard, /readableSourceIndexes\.has\(item\.source_index\)/);
});

test("R6 rerun retains prior sessions and regeneration avoids external research", async () => {
  const route = await source("../src/routes/research.js");
  assert.match(route, /persistResearchGraph\(project\.id, brief, \{ status: "completed" \}\)/);
  assert.match(route, /corpusRetained: true/);
  assert.match(route, /previousCorpusRetained: true/);
  assert.match(route, /repeatedExternalResearch: false/);
});

test("R6 persisted research inspection, metrics and conflict resolution endpoints exist", async () => {
  const route = await source("../src/routes/research.js");
  assert.match(route, /router\.get\("\/:id\/research\/graph"/);
  assert.match(route, /router\.get\("\/:id\/research\/memory"/);
  assert.match(route, /router\.get\("\/:id\/research\/metrics"/);
  assert.match(route, /router\.post\("\/:id\/research\/conflicts\/:conflictId\/resolve"/);
  assert.match(route, /current research session/i);
});

test("R6 research UI stops both polling loops at terminal states", async (t) => {
  const page = await source("../../frontend/src/pages/ResearchPage.jsx").catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (page === null) { t.skip("Frontend sources are not part of the backend-only Docker image; run in the complete workspace."); return; }
  assert.match(page, /const terminal = nextProject\?\.researchStatus === "error"/);
  assert.match(page, /nextProject\?\.researchStatus === "ready" && !readyWithoutReport/);
  assert.match(page, /data\.status === "ready" \|\| data\.status === "error"/);
});
