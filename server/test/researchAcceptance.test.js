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
  assert.match(memory, /Helix did not perform a web search for this follow-up/);
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

test("R6 research UI stops both polling loops at terminal states", async () => {
  const page = await source("../../frontend/src/pages/ResearchPage.jsx");
  assert.match(page, /researchStatus === "ready" \|\| nextProject\?\.researchStatus === "error"/);
  assert.match(page, /data\.status === "ready" \|\| data\.status === "error"/);
});
