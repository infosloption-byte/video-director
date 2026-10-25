// Per-user settings stored in users.preferences (JSON). Unknown or invalid values fall back to defaults.
export const DEFAULT_PREFERENCES = Object.freeze({
  theme: null, // null = no saved choice; each device keeps its own theme until one is picked
  sidebarCollapsed: false,
  reduceMotion: false,
  productUpdates: false,
  securityAlerts: true,
});

const VALIDATORS = {
  theme: (v) => v === "dark" || v === "light",
  sidebarCollapsed: (v) => typeof v === "boolean",
  reduceMotion: (v) => typeof v === "boolean",
  productUpdates: (v) => typeof v === "boolean",
  securityAlerts: (v) => typeof v === "boolean",
};

export function resolvePreferences(stored) {
  const base = { ...DEFAULT_PREFERENCES };
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    for (const key of Object.keys(VALIDATORS)) if (VALIDATORS[key](stored[key])) base[key] = stored[key];
  }
  return base;
}

/** Returns { value } with the merged, validated preferences or { error } when the patch contains bad input. */
export function mergePreferences(stored, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { error: "Send an object of settings to change." };
  const next = resolvePreferences(stored);
  for (const [key, value] of Object.entries(patch)) {
    if (!VALIDATORS[key]) return { error: `Unknown setting: ${key}.` };
    if (!VALIDATORS[key](value)) return { error: `Invalid value for ${key}.` };
    next[key] = value;
  }
  return { value: next };
}

export function alertsEnabled(user) {
  return resolvePreferences(user?.preferences).securityAlerts;
}
