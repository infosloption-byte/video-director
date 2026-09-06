import test from "node:test";
import assert from "node:assert/strict";
import { verifyResearchBrief } from "../src/services/researchVerificationService.js";

function fixtureFindings(count = 8) {
  return Array.from({ length: count }, (_, index) => ({
    claim: `Research finding ${index + 1} is supported by the underlying evidence`,
    evidence: `The supplied source evidence supports research finding ${index + 1}.`,
    confidence: 80 - index,
    evidence_level: index === 7 ? "limited" : "strong",
    source_indexes: index % 2 === 0 ? [0, 1] : [0],
  }));
}

function fixtureSources() {
  return [
    { index: 0, url: "https://example.gov/research", title: "Government source", source_class: "government", source_reliability: "primary", read_status: "read", publisher: "Example Government" },
    { index: 1, url: "https://example.edu/paper", title: "Academic source", source_class: "academic", source_reliability: "peer_reviewed", read_status: "read", publisher: "Example University" },
    { index: 2, url: "https://example.net/unread", title: "Unread source", source_class: "web", source_reliability: "general_web", read_status: "http_403" },
  ];
}

test("M17 verifies representative science, technology, current-events, and controversial briefs", () => {
  const topics = ["science", "technology", "current events", "controversial claims"];
  for (const topic of topics) {
    const result = verifyResearchBrief({
      topic,
      sources: fixtureSources(),
      evidence_preview: [
        { source_index: 0, excerpt: "Exact government evidence passage." },
        { source_index: 1, excerpt: "Exact academic evidence passage." },
      ],
      key_findings: fixtureFindings(),
      disagreements: topic === "controversial claims" ? [{ topic: "research finding", positions: ["supported", "disputed"], resolution: "Mixed evidence." }] : [],
    });

    assert.equal(result.summary.claims_checked, 8);
    assert.equal(result.summary.claims_traceable, 8);
    assert.equal(result.summary.independent_domains, 3);
    assert.equal(result.guardrails.source_authority_separate_from_claim_confidence, true);
  }
});

test("M17 treats unreadable sources as unverified evidence", () => {
  const result = verifyResearchBrief({
    sources: fixtureSources(),
    evidence_preview: [],
    key_findings: [{
      claim: "A claim backed only by an inaccessible source",
      evidence: "The source could not be read.",
      confidence: 95,
      evidence_level: "established",
      source_indexes: [2],
    }],
  });

  assert.equal(result.claims[0].traceable, false);
  assert.equal(result.claims[0].verification_status, "unverified");
  assert.equal(result.claims[0].verified_confidence, 25);
  assert.equal(result.guardrails.inaccessible_sources_treated_as_unverified, true);
});

test("M17 rejects invalid source indexes from claim provenance", () => {
  const result = verifyResearchBrief({
    sources: fixtureSources(),
    evidence_preview: [{ source_index: 0, excerpt: "Readable evidence." }],
    key_findings: [{
      claim: "Partially traceable claim",
      evidence: "Supported by one valid source.",
      confidence: 90,
      evidence_level: "strong",
      source_indexes: [0, 999],
    }],
  });

  assert.deepEqual(result.claims[0].source_indexes, [0]);
  assert.deepEqual(result.claims[0].invalid_source_indexes, [999]);
  assert.equal(result.claims[0].traceable, true);
});
