import { deepResearchSignal } from "./deepResearchService.js";
import { verifyResearchBrief } from "./researchVerificationService.js";
import { adjudicateResearchConflicts, attachEvidenceIndexes } from "./researchAdjudicationService.js";
import { normalizeResearchBrief, sanitizeResearchJson } from "./researchNormalization.js";
import { ensureStructuredResearchReport } from "./researchReportBuilder.js";

export async function researchSignal(signal, { onProgress, onActivity } = {}) {
  const rawBrief = normalizeResearchBrief(await deepResearchSignal(signal, { onProgress, onActivity }));
  const structuredBrief = normalizeResearchBrief(await ensureStructuredResearchReport(
    String(signal?.title || "Research topic").trim(),
    rawBrief,
    Array.isArray(rawBrief.sources) ? rawBrief.sources : [],
    { onActivity },
  ));
  const evidenceLinkedBrief = attachEvidenceIndexes(structuredBrief);
  onProgress?.("verifying", 88);
  onActivity?.({ type: "verification.completed", message: "Source traceability and claim verification completed." });
  const verification = verifyResearchBrief(evidenceLinkedBrief);
  const adjudication = await adjudicateResearchConflicts(evidenceLinkedBrief);
  onActivity?.({ type: "verification.adjudicated", conflicts: adjudication.conflicts.length, message: `${adjudication.conflicts.length} evidence conflict case(s) evaluated.` });
  const mergedVerification = {
    ...verification,
    conflicts: adjudication.conflicts,
    summary: {
      ...verification.summary,
      conflicts_detected: adjudication.conflicts.length,
      conflicts_adjudicated: adjudication.summary.conflictsAdjudicated,
      conflicts_unresolved: adjudication.summary.conflictsUnresolved,
      adjudication_model_assisted: adjudication.summary.modelAssisted,
      adjudication_model_error: adjudication.summary.modelError,
    },
  };
  const reliability = {
    ...evidenceLinkedBrief.reliability_assessment,
    overall_score: Math.round(((Number(evidenceLinkedBrief.reliability_assessment?.overall_score) || 0) * 0.55) + (verification.summary.traceability_score * 0.2) + (verification.summary.average_claim_confidence * 0.15) + (verification.summary.average_source_authority * 0.1)),
    verification_score: verification.summary.average_claim_confidence,
    traceability_score: verification.summary.traceability_score,
  };
  onProgress?.("synthesizing", 96);
  const finalBrief = {
    ...evidenceLinkedBrief,
    verification: mergedVerification,
    adjudication,
    reliability_assessment: reliability,
    research_metrics: {
      ...(evidenceLinkedBrief.research_metrics || {}),
      claims_checked: verification.summary.claims_checked,
      claims_traceable: verification.summary.claims_traceable,
      claims_corroborated: verification.summary.claims_corroborated,
      conflicts_detected: adjudication.conflicts.length,
      conflicts_adjudicated: adjudication.summary.conflictsAdjudicated,
      conflicts_unresolved: adjudication.summary.conflictsUnresolved,
      adjudication_model_assisted: adjudication.summary.modelAssisted,
      traceability_score: verification.summary.traceability_score,
      structured_findings: Array.isArray(evidenceLinkedBrief.key_findings) ? evidenceLinkedBrief.key_findings.length : 0,
      evidence_backed_takeaways: Array.isArray(evidenceLinkedBrief.evidence_backed_takeaways) ? evidenceLinkedBrief.evidence_backed_takeaways.length : 0,
      structured_report_target_met: Boolean(evidenceLinkedBrief.report_quality?.target_met),
    },
  };
  return sanitizeResearchJson(finalBrief);
}
