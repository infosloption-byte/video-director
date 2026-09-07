import test from "node:test";
import assert from "node:assert/strict";
import { answerResearchQuestion, summarizeResearchMetrics } from "../src/services/researchMemoryService.js";

const source = { id: "s1", sourceIndex: 0, title: "Study A", readStatus: "read", authorityScore: 90 };
const evidence = { id: "e1", evidenceIndex: 0, sourceId: "s1", passageText: "The intervention improved outcomes in the tested population.", locator: "chars:0-62" };
const session = {
  id: "session-1", version: 1, status: "completed", sources: [source], evidence: [evidence],
  claims: [{ id: "c1", claimText: "The intervention improves outcomes", verificationStatus: "single_source", verifiedConfidence: 78, verification: { traceable: true } }],
  conflicts: [{ id: "x1", status: "unresolved" }],
};

test("M17 research memory metrics summarize corpus health", () => {
  const metrics = summarizeResearchMetrics(session);
  assert.equal(metrics.sources, 1);
  assert.equal(metrics.readableSources, 1);
  assert.equal(metrics.evidencePassages, 1);
  assert.equal(metrics.traceableClaims, 1);
  assert.equal(metrics.unresolvedConflicts, 1);
  assert.equal(metrics.averageVerifiedConfidence, 78);
});

test("M17 follow-up answers only from persisted evidence", () => {
  const result = answerResearchQuestion(session, "Did the intervention improve outcomes?");
  assert.match(result.answer, /improved outcomes/i);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].id, "e1");
  assert.equal(result.grounded, true);
  assert.equal(result.searchUsed, false);
});

test("R6 follow-up explicitly marks an unsupported answer and never searches the web", () => {
  const result = answerResearchQuestion(session, "What is the capital of France?");
  assert.match(result.answer, /No sufficiently relevant evidence/i);
  assert.match(result.answer, /did not perform a web search/i);
  assert.equal(result.evidence.length, 0);
  assert.equal(result.grounded, false);
  assert.equal(result.searchUsed, false);
});
