function clamp(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

const STOP_WORDS = new Set(["about", "after", "again", "also", "because", "being", "between", "could", "from", "have", "into", "more", "most", "other", "over", "such", "than", "that", "their", "there", "these", "they", "this", "through", "were", "which", "with", "would", "your"]);
const NEGATIVE = /\b(no|not|never|unlikely|fails?|failed|lack(?:s|ed)?|limited|weak|harm(?:s|ful|ed)?|risk(?:s|y)?|worse|declin(?:e|d|ing)|decreas(?:e|d|ing)|contra(?:ry|dict)|dispute|uncertain|unsupported|did\s+not|does\s+not)\b/i;
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
  const negative = NEGATIVE.test(text);
  const positive = POSITIVE.test(text);
  // Explicit negation should win over a positive keyword contained in the same phrase,
  // e.g. "did not improve" or "no improvement".
  if (negative) return "negative";
  if (positive) return "positive";
  return "neutral";
}

function confidence(claim = {}) { return clamp(claim.verified_confidence ?? claim.confidence ?? claim.model_confidence); }

function deterministicConflicts(brief = {}) {
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
      conflicts.push({ finding_indexes: [leftIndex, rightIndex], similarity, positions: [left.claim, right.claim], reason: "Similar claims contain materially opposing evidence signals.", resolution, status, confidence: resolutionConfidence, method: "deterministic" });
    }
  }

  for (const conflict of existing) {
    const indexes = Array.isArray(conflict.finding_indexes) ? conflict.finding_indexes.map(Number) : [];
    if (indexes.length !== 2 || indexes.some((index) => !Number.isInteger(index))) continue;
    const key = `${Math.min(...indexes)}:${Math.max(...indexes)}`;
    if (seen.has(key)) continue;
    conflicts.push({ ...conflict, status: conflict.status || "unresolved", resolution: conflict.resolution || "Conflicting evidence detected; review the linked source passages before making a definitive claim.", confidence: clamp(conflict.confidence ?? 50), method: "deterministic" });
  }

  return conflicts;
}

function evidenceForConflict(brief, conflict) {
  const findings = Array.isArray(brief.key_findings) ? brief.key_findings : [];
  const passages = Array.isArray(brief.evidence_preview) ? brief.evidence_preview : [];
  return (conflict.finding_indexes || []).map((index) => {
    const finding = findings[index] || {};
    const evidenceIndexes = Array.isArray(finding.evidence_indexes) ? finding.evidence_indexes : [];
    return {
      finding_index: index,
      claim: finding.claim,
      confidence: confidence(finding),
      evidence_level: finding.evidence_level,
      passages: evidenceIndexes.slice(0, 3).map((evidenceIndex) => passages[evidenceIndex]).filter(Boolean).map((passage) => ({
        source_index: passage.source_index,
        title: passage.title,
        excerpt: passage.excerpt,
        locator: passage.locator,
      })),
    };
  });
}

async function modelAdjudicate(brief, conflicts) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !conflicts.length) return { conflicts, attempted: false };
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const cases = conflicts.map((conflict, index) => ({ case_index: index, conflict, evidence: evidenceForConflict(brief, conflict) }));
  const prompt = `You are the Helix research adjudicator. Resolve only the supplied evidence conflicts. Treat exact source passages as the ground truth for what a source actually says. Do not invent evidence, sources, facts, consensus, or causal claims. A conflict may be unresolved when the passages differ in population, method, date, outcome, scope, or certainty. Prefer the better-supported position only when the supplied evidence clearly supports doing so. Return JSON with a conflicts array. Each item must have case_index, status (adjudicated|unresolved), resolution, confidence (0-100), rationale, and winning_finding_index (integer or null).\n\nCASES:\n${JSON.stringify(cases)}`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 6000 } }),
      signal: AbortSignal.timeout(60000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `Gemini adjudicator returned ${response.status}.`);
    const raw = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    const start = raw.indexOf("{"); const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Invalid adjudication JSON.");
    const parsed = JSON.parse(raw.slice(start, end + 1));
    const decisions = Array.isArray(parsed.conflicts) ? parsed.conflicts : [];
    const resolved = conflicts.map((conflict, index) => {
      const decision = decisions.find((item) => Number(item.case_index) === index);
      if (!decision) return conflict;
      return { ...conflict, status: decision.status === "adjudicated" ? "adjudicated" : "unresolved", resolution: String(decision.resolution || conflict.resolution), confidence: clamp(decision.confidence ?? conflict.confidence), rationale: String(decision.rationale || ""), winning_finding_index: Number.isInteger(decision.winning_finding_index) ? decision.winning_finding_index : null, method: "model_assisted" };
    });
    return { conflicts: resolved, attempted: true };
  } catch (error) {
    return { conflicts, attempted: true, error: error.message };
  }
}

export async function adjudicateResearchConflicts(brief = {}) {
  const deterministic = deterministicConflicts(brief);
  const model = await modelAdjudicate(brief, deterministic);
  const conflicts = model.conflicts.map((conflict) => ({ ...conflict, adjudication_status: conflict.status }));
  return { conflicts, summary: { conflictsAdjudicated: conflicts.filter((item) => item.status === "adjudicated").length, conflictsUnresolved: conflicts.filter((item) => item.status !== "adjudicated").length, modelAssisted: model.attempted, modelError: model.error || null } };
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
