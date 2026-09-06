import { deepResearchSignal } from "./deepResearchService.js";
import { verifyResearchBrief } from "./researchVerificationService.js";

export async function researchSignal(signal, { onProgress } = {}) {
  const brief = await deepResearchSignal(signal, { onProgress });
  onProgress?.("verifying", 94);
  const verification = verifyResearchBrief(brief);
  const reliability = {
    ...brief.reliability_assessment,
    overall_score: Math.round(((Number(brief.reliability_assessment?.overall_score) || 0) * 0.55) + (verification.summary.traceability_score * 0.2) + (verification.summary.average_claim_confidence * 0.15) + (verification.summary.average_source_authority * 0.1)),
    verification_score: verification.summary.average_claim_confidence,
    traceability_score: verification.summary.traceability_score,
  };
  return {
    ...brief,
    verification,
    reliability_assessment: reliability,
    research_metrics: {
      ...(brief.research_metrics || {}),
      claims_checked: verification.summary.claims_checked,
      claims_traceable: verification.summary.claims_traceable,
      claims_corroborated: verification.summary.claims_corroborated,
      conflicts_detected: verification.summary.conflicts_detected,
      traceability_score: verification.summary.traceability_score,
    },
  };
}
