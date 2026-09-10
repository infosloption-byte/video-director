import test from "node:test";
import assert from "node:assert/strict";
import { normalizeResearchBrief } from "../src/services/researchNormalization.js";

test("research normalization converts structured model text into render-safe strings", () => {
  const brief = normalizeResearchBrief({
    mechanism: { components: ["signal", "response"], confidence: 0.9, explanation: "A structured explanation." },
    executive_summary: { explanation: "A safe executive summary." },
    key_findings: [{ claim: { explanation: "A claim" }, evidence: { summary: "Supporting evidence" }, source_indexes: [0, "1"] }],
    safe_claims: [{ explanation: "A safe claim" }],
    reliability_assessment: { label: { value: "high" }, rationale: { explanation: "Strong evidence." }, limitations: [{ text: "Limited sample." }] },
  });

  assert.equal(brief.mechanism, "A structured explanation.");
  assert.equal(brief.executive_summary, "A safe executive summary.");
  assert.equal(brief.key_findings[0].claim, "A claim");
  assert.equal(brief.key_findings[0].evidence, "Supporting evidence");
  assert.deepEqual(brief.key_findings[0].source_indexes, [0, 1]);
  assert.deepEqual(brief.safe_claims, ["A safe claim"]);
  assert.equal(brief.reliability_assessment.label, "high");
  assert.equal(brief.reliability_assessment.rationale, "Strong evidence.");
  assert.deepEqual(brief.reliability_assessment.limitations, ["Limited sample."]);
});

test("research normalization removes undefined values from JSON arrays and objects", () => {
  const brief = normalizeResearchBrief({
    key_facts: [undefined, "Useful fact", { claim: "Another fact", extra: undefined }],
    nested: { value: undefined, safe: "ok", values: ["one", undefined, "two"] },
  });

  assert.deepEqual(brief.key_facts, ["Useful fact", "Another fact"]);
  assert.deepEqual(brief.nested, { safe: "ok", values: ["one", "two"] });
});
