import test from "node:test";
import assert from "node:assert/strict";
import { adjudicateResearchConflicts, attachEvidenceIndexes } from "../src/services/researchAdjudicationService.js";

const baseConflictBrief = {
  key_findings: [
    { claim: "The intervention improves outcomes consistently", evidence: "Studies report improved outcomes and strong support.", confidence: 82, evidence_level: "strong", source_indexes: [0], evidence_indexes: [0] },
    { claim: "The intervention improves outcomes consistently", evidence: "Other studies report no improvement and limited support.", confidence: 58, evidence_level: "limited", source_indexes: [1], evidence_indexes: [1] },
  ],
  evidence_preview: [
    { source_index: 0, title: "Study A", excerpt: "The intervention improves outcomes in the tested population.", locator: "chars:0-64" },
    { source_index: 1, title: "Study B", excerpt: "The intervention did not improve outcomes in the tested population.", locator: "chars:120-187" },
  ],
};

test("M17 detects opposing claims and falls back deterministically without Gemini", async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const result = await adjudicateResearchConflicts(baseConflictBrief);
    assert.equal(result.summary.modelAssisted, false);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].status, "adjudicated");
    assert.equal(result.conflicts[0].method, "deterministic");
    assert.equal(result.conflicts[0].adjudication_status, "adjudicated");
    assert.equal(result.summary.conflictsAdjudicated, 1);
    assert.equal(result.summary.conflictsUnresolved, 0);
  } finally {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
});

test("M17 preserves unresolved conflicts when verification confidence is close", async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const result = await adjudicateResearchConflicts({
      ...baseConflictBrief,
      key_findings: baseConflictBrief.key_findings.map((finding) => ({ ...finding, confidence: 70 })),
    });
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].status, "unresolved");
    assert.match(result.conflicts[0].resolution, /different directions/i);
    assert.equal(result.summary.conflictsUnresolved, 1);
  } finally {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
});

test("M17 attaches finding evidence indexes to the strongest matching source passages", () => {
  const result = attachEvidenceIndexes({
    key_findings: [{
      claim: "Satellite observations measure rising sea levels",
      source_indexes: [1],
    }],
    evidence_preview: [
      { source_index: 0, excerpt: "Unrelated economic data." },
      { source_index: 1, excerpt: "Satellite observations measure rising sea levels over time." },
    ],
  });

  assert.deepEqual(result.key_findings[0].evidence_indexes, [1]);
});

test("M17 ignores malformed existing conflict indexes", async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const result = await adjudicateResearchConflicts({
      key_findings: [],
      verification: { conflicts: [{ finding_indexes: ["bad", 2] }] },
    });
    assert.equal(result.conflicts.length, 0);
  } finally {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
});
