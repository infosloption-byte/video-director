const activeControllers = new Map();

export function registerResearchController(researchKey) {
  const key = String(researchKey || "").trim();
  if (!key) return null;
  const previous = activeControllers.get(key);
  previous?.abort(new Error("Research was superseded."));
  const controller = new AbortController();
  activeControllers.set(key, controller);
  return controller;
}

export function cancelResearch(researchKey) {
  const key = String(researchKey || "").trim();
  if (!key) return false;
  const controller = activeControllers.get(key);
  if (!controller) return false;
  controller.abort(new Error("Research was stopped by the user."));
  return true;
}

export function clearResearchController(researchKey, controller) {
  const key = String(researchKey || "").trim();
  if (!key || !controller) return;
  if (activeControllers.get(key) === controller) activeControllers.delete(key);
}

export function hasActiveResearchController(researchKey) {
  const key = String(researchKey || "").trim();
  return Boolean(key && activeControllers.has(key));
}
