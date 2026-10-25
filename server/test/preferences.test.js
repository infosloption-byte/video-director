import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREFERENCES, mergePreferences, resolvePreferences, alertsEnabled } from "../src/services/preferences.js";

test("resolvePreferences falls back to defaults for missing or invalid stored data", () => {
  assert.deepEqual(resolvePreferences(null), DEFAULT_PREFERENCES);
  assert.deepEqual(resolvePreferences({ theme: "neon", reduceMotion: "yes" }), DEFAULT_PREFERENCES);
  assert.equal(resolvePreferences({ theme: "light" }).theme, "light");
  assert.equal(resolvePreferences({}).theme, null);
});

test("mergePreferences validates keys and values and keeps existing settings", () => {
  const ok = mergePreferences({ theme: "light" }, { reduceMotion: true });
  assert.equal(ok.value.theme, "light");
  assert.equal(ok.value.reduceMotion, true);
  assert.ok(mergePreferences({}, { theme: "blue" }).error);
  assert.ok(mergePreferences({}, { isAdmin: true }).error);
  assert.ok(mergePreferences({}, []).error);
});

test("security alerts default on and can be turned off", () => {
  assert.equal(alertsEnabled({ preferences: null }), true);
  assert.equal(alertsEnabled({ preferences: { securityAlerts: false } }), false);
});
