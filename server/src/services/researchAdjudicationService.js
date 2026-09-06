function clamp(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

const STOP_WORDS = new Set(["about", "after", "again", "also", "because", "being", "between", "could", "from", "have", "into", "more", "most", "other", "over", "such", "than", "that", "their", "there", "these", "they", "this", "through", "were", "which", "with", "would", "your"]);
const NEGATIVE = /\b(no|not|never|unlikely|fails?|failed|lack(?:s|ed)?|limited|weak|harm(?:s|ful|ed)?|risk(?:s|y)?|worse|declin(?:e|ed|ing)|decreas(?:e|ed|ing)|contra(?:ry|dict)|dispute|uncertain|unsupported)\b/i;
const POSITIVE = /\b(support(?:s|ed)?|effective|benefit(?:s|ed)?|improv(?:e|d|es|ing)|increase(?:s|d|ing)?|strong|consistent|associated|significant|works|successful|established)\b/i;

function tokens(text) {
  return new Set(String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((token) => token.length > 3 && !STOP_WORDS.has(token)));
}

function overlap(left, right) {
  const a = tokens(left); const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return Math.round((shared / Math.max(1, Math.min(a.size, b.size))) * 100);
}

function polarity(text) {
  const negative = NEGATIVE.test(text); const positive = POSITIVE.test(text);
  if (negative && !positive) return "negative";
  if (positive && !negative) return "positive";
  return "neutral";
}

function confidence(claim = {}) { return clamp(claim.verified_confidence ?? claim.confidence ?? claim.model_confidence); }

export function adjudicateResearchConflicts(brief = {}) {
  const findings = Array.isArray(brief.key_findings) ? brief.key_findings : [];
  const existing = Array.isArray(brief.verification?.conflicts) ? brief.verification.conflicts : [];
  const conflicts = []; const seen = new Set();

  for (let leftIndex = 0; leftIndex < findings.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < findings.length; rightIndex += 1) {
      const left = findings[leftIndex] || {}; const right = findings[rightIndex] || {};
      const similarity = overlap(left.claim, right.claim);
      if (similarity < 55) continue;
      const leftPolarity = polarity(`${left.claim} ${left.evidence}`); const rightPolarity = polarity(`${right.claim} ${right.evidence}`);
      if (leftPolarity === "neutral" || rightPolarity === "neutral" || leftPolarity === rightPolarity) continue;
      const key = `${leftIndex}:${rightIndex}`; seen.add(key);
      const leftConfidence = confidence(left); const rightConfidence = confidence(right); const gap = Math.abs(leftConfidence - rightConfidence);
      let status = "unresolved";
      let resolution = "Evidence points in different directions; preserve both positions and explain the uncertainty.";
      let resolutionConfidence = Math.max(30, Math.min(85, Math.round((leftConfidence + rightConfidence) / 2)));
      if (gap >= 15) {
        const strongerIndex = leftConfidence >= rightConfidence ? leftIndex : rightIndex;
        const strongerConfidence = Math.max(leftConfidence, rightConfidence);
        status = "adjudicated";
        resolution = `The ${strongerIndex === leftIndex ? "first" : "second"} position has stronger verification support (${strongerConfidence}% vs ${Math.min(leftConfidence, rightConfidence)}%), but the opposing evidence should remain visible.`;
        resolutionConfidence = Math.min(90, Math.max(55, strongerConfidence));
      }
      conflicts.push({ finding_indexes: [leftIndex, rightIndex], similarity, positions: [left.claim, right.claim], reason: "Similar claims contain materially opposing evidence signals.", resolution, status, confidence: resolutionConfidence });
    }
  }

  for (const conflict of existing) {
    const indexes = Array.isArray(conflict.finding_indexes) ? conflict.finding_indexes.map(Number) : [];
    if (indexes.length !== 2 || indexes.some((index) => !Number.isInteger(index))) continue;
    const key = `${Math.min(...indexes)}:${Math.max(...indexes)}`;
    if (seen.has(key)) continue;
    conflicts.push({ ...conflict, status: conflict.status || "unresolved", resolution: conflict.resolution || "Conflicting evidence detected; review the linked source passages before making a definitive claim.", confidence: clamp(conflict.confidence ?? 50) });
  }

  return { conflicts, summary: { conflictsAdjudicated: conflicts.filter((item) => item.status === "adjudicated").length, conflictsUnresolved: conflicts.filter((item) => item.status !== "adjudicated").length } };
}

export function attachEvidenceIndexes(brief = {}) {
  const previews = Array.isArray(brief.evidence_preview) ? brief.evidence_preview : [];
  const findings = Array.isArray(brief.key_findings) ? brief.key_findings : [];
  if (!previews.length || !findings.length) return brief;
  const enrichedFindings = findings.map((finding) => {
    if (Array.isArray(finding.evidence_indexes) && finding.evidence_indexes.length) return finding;
    const sourceIndexes = new Set((finding.source_indexes || []).map(Number).filter(Number.isInteger));
    const scored = previews.map((preview, index) => {
      const sourceIndex = Number(preview.source_index ?? preview.sourceIndex);
      const sourceMatch = sourceIndexes.has(sourceIndex) ? 100 : 0;
      return { index, score: sourceMatch + overlap(finding.claim, preview.excerpt || preview.passage || preview.text) };
    }).filter((item) => item.score >= 35).sort((a, b) => b.score - a.score).slice(0, 3);
    return { ...finding, evidence_indexes: scored.map((item) => item.index) };
  });
  return { ...brief, key_findings: enrichedFindings };
}
