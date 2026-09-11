import test from "node:test";
import assert from "node:assert/strict";
import { ensureStructuredResearchReport } from "../src/services/researchReportBuilder.js";

test("structured report builder preserves valid findings and emits evidence-backed takeaways", async () => {
  const brief = {
    executive_summary: "A concise research synthesis.",
    what_happened: "The research established a documented sequence of events.",
    why_it_matters: "The evidence changes how the topic should be understood.",
    mechanism: "The observed effect follows the documented mechanism.",
    key_findings: Array.from({ length: 8 }, (_, index) => ({
      claim: `Supported finding ${index + 1}`,
      evidence: `Source-backed evidence for finding ${index + 1}.`,
      confidence: 80 + index,
      evidence_level: "strong",
      source_indexes: [index],
      evidence_indexes: [index],
    })),
    evidence_preview: Array.from({ length: 8 }, (_, index) => ({
      evidence_index: index,
      source_index: index,
      title: `Source ${index + 1}`,
      excerpt: `Exact supporting passage ${index + 1}.`,
      locator: `chars:${index * 10}-${index * 10 + 25}`,
    })),
    knowledge_gaps: ["Long-term evidence remains limited."],
  };

  const result = await ensureStructuredResearchReport("Research topic", brief, Array.from({ length: 8 }, (_, index) => ({ index })));

  assert.equal(result.key_findings.length, 8);
  assert.equal(result.evidence_backed_takeaways.length, 8);
  assert.ok(result.synthesis_sections.length >= 4);
  assert.match(result.bottom_line, /Supported finding 1/);
  assert.equal(result.report_quality.target_met, true);
  assert.equal(result.report_quality.structured_repair_applied, false);
});

test("structured report builder fills missing findings from readable source material without inventing sources", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const sources = Array.from({ length: 8 }, (_, index) => ({
      index,
      title: `Readable source ${index + 1}`,
      url: `https://example.com/source-${index + 1}`,
      read_status: "read",
      quality_prior: 85,
      content: `The research topic produced a documented result in study ${index + 1}. The analysis reported a measurable change associated with the topic in sample ${index + 1}. The result was observed directly and reported by the source.`,
    }));
    const result = await ensureStructuredResearchReport("Research topic", { executive_summary: "Initial synthesis." }, sources);

    assert.ok(result.key_findings.length >= 8);
    assert.equal(result.report_quality.target_met, true);
    assert.equal(result.report_quality.structured_repair_applied, false);
    assert.ok(result.key_findings.every((finding) => finding.source_indexes.length > 0));
    assert.ok(result.key_findings.every((finding) => finding.evidence.length > 0));
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});
