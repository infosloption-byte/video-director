import test from "node:test";
import assert from "node:assert/strict";
import { PLANS, configuredPlans, mergePlanLimits } from "../src/services/billingService.js";
import { getSetupCatalog, validateSetup, buildSetupSuggestions } from "../src/services/setupService.js";
import { isRegistrationOpen, getPublicPlatformConfig } from "../src/services/platformConfigService.js";
import { validatePlanLimits, validatePlatformSettings, validateMasterItem } from "../src/services/adminManagementService.js";

test("plan changes affect real entitlements, without changing Paddle pricing", async () => {
  const db = { platformPlanLimit: { findMany: async () => [{ planId: "creator", rendersPerMonth: 42, maxSeconds: 45 }] } };
  const plans = await configuredPlans(db);
  assert.equal(plans.creator.rendersPerMonth, 42);
  assert.equal(plans.creator.maxSeconds, 45);
  assert.equal(plans.creator.monthlyUsd, PLANS.creator.monthlyUsd);
  assert.equal(plans.free.rendersPerMonth, PLANS.free.rendersPerMonth);
  assert.deepEqual(mergePlanLimits(PLANS.creator, null), PLANS.creator);
  assert.ok(validatePlanLimits("creator", { rendersPerMonth: 2, maxSeconds: 45 }).value);
  assert.ok(validatePlanLimits("creator", { rendersPerMonth: 2, maxSeconds: 45, monthlyUsd: 0 }).error);
  assert.ok(validatePlanLimits("creator", { rendersPerMonth: 0, maxSeconds: 45 }).error);
});

test("managed tone/audience values are used by story setup validation", async () => {
  const db = { platformMasterItem: { findMany: async () => [
    { category: "tone", label: "Documentary" },
    { category: "audience", label: "General public" },
  ] } };
  const catalog = await getSetupCatalog(db);
  assert.deepEqual(catalog.tones, ["Documentary"]);
  const selections = { length: 30, framework: "how-it-works", tone: "Documentary", audienceLevel: "General public" };
  assert.ok(validateSetup(selections, catalog).value);
  assert.ok(validateSetup({ ...selections, tone: "Energetic" }, catalog).error);
  const suggestions = buildSetupSuggestions({ researchSources: {}, monetizationFlags: [] }, catalog);
  assert.deepEqual(suggestions.tone.options, ["Documentary"]);
  assert.deepEqual(suggestions.audience.options, ["General public"]);
});

test("registration control defaults open and blocks new signups when paused", async () => {
  const openDb = { platformSettings: { findUnique: async () => null } };
  const closedDb = { platformSettings: { findUnique: async () => ({ registrationOpen: false, announcement: "Paused" }) } };
  assert.equal(await isRegistrationOpen(openDb), true);
  assert.equal(await isRegistrationOpen(closedDb), false);
  assert.deepEqual(await getPublicPlatformConfig(closedDb), { registrationOpen: false, announcement: "Paused" });
  assert.ok(validatePlatformSettings({ registrationOpen: false, announcement: "Paused" }).value);
  assert.ok(validatePlatformSettings({ registrationOpen: true, announcement: "", apiKey: "secret" }).error);
});

test("master items are validated and cannot create arbitrary system fields", () => {
  assert.ok(validateMasterItem({ category: "tone", code: "documentary", label: "Documentary" }).value);
  assert.ok(validateMasterItem({ category: "role", code: "admin", label: "Platform admin" }).error);
  assert.ok(validateMasterItem({ label: "Thoughtful", active: false, sortOrder: 22 }, { update: true }).value);
  assert.ok(validateMasterItem({ label: "Thoughtful", active: false, sortOrder: 22, category: "role" }, { update: true }).error);
});
