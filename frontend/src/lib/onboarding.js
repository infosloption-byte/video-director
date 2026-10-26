// Never use an unvalidated ?next= value for browser navigation.
export const planIds = Object.freeze(["free", "creator", "studio"]);
export function validPlan(value) { return planIds.includes(value) ? value : null; }
export function safeInternalPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  // Avoid raw control characters and backslashes in navigation URLs; the
  // escaped range is written as numeric code points for lint compatibility.
  if (Array.from(value).some(char => char === "\\\\" || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return null;
  try {
    const url = new URL(value, "https://usevoxora.online");
    if (url.origin !== "https://usevoxora.online") return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}
export function onboardingDestination(plan) {
  const chosen = validPlan(plan);
  return chosen && chosen !== "free" ? `/choose-plan?plan=${chosen}` : "/choose-plan";
}
export function destinationFromSearch(search, fallback = "/choose-plan") {
  const params = new URLSearchParams(search || "");
  const next = safeInternalPath(params.get("next"));
  if (next) return next;
  const plan = validPlan(params.get("plan"));
  return plan ? onboardingDestination(plan) : fallback;
}
export function selectedPlanFromDestination(next) {
  const path = safeInternalPath(next);
  if (!path) return null;
  const url = new URL(path, "https://usevoxora.online");
  return url.pathname === "/choose-plan" ? validPlan(url.searchParams.get("plan")) : null;
}
export function verificationPath(next) {
  return `/verify-email?next=${encodeURIComponent(safeInternalPath(next) || "/choose-plan")}`;
}
export function authPath(path, next) {
  return `${path}?next=${encodeURIComponent(safeInternalPath(next) || "/choose-plan")}`;
}
export function unfinishedPlanDestination(user, fallback = "/choose-plan") {
  if (!user || user.planSelectedAt) return safeInternalPath(fallback) || "/my-research";
  const stored = validPlan(user.intendedPlan);
  if (stored) return onboardingDestination(stored);
  const linkPlan = selectedPlanFromDestination(fallback);
  return onboardingDestination(linkPlan);
}
