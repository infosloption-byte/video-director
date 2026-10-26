export const ONBOARDING_PLANS = Object.freeze(["free", "creator", "studio"]);
export function normalizeIntendedPlan(plan) {
  return ONBOARDING_PLANS.includes(plan) ? plan : null;
}
