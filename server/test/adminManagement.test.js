import test from "node:test";
import assert from "node:assert/strict";
import { validatePlanLimits, validatePlatformSettings, validateMasterItem } from "../src/services/adminManagementService.js";
import { mergePlanLimits } from "../src/services/billingService.js";
import { normalizePublicPlatformConfig } from "../src/services/platformConfigService.js";

test("admin plan overrides respect caps and cannot change price", () => {
  assert.deepEqual(validatePlanLimits("creator", { rendersPerMonth: 40, maxSeconds: 90 }).value, { rendersPerMonth: 40, maxSeconds: 90 });
  assert.ok(validatePlanLimits("creator", { rendersPerMonth: 0, maxSeconds: 60 }).error);
  assert.ok(validatePlanLimits("creator", { rendersPerMonth: 40, maxSeconds: 60, monthlyUsd: 0 }).error);
  assert.ok(validatePlanLimits("unrecognized", { rendersPerMonth: 40, maxSeconds: 60 }).error);
  const plan = mergePlanLimits({ id: "creator", name: "Creator", monthlyUsd: 19, rendersPerMonth: 30, maxSeconds: 60 }, { rendersPerMonth: 40, maxSeconds: 90 });
  assert.equal(plan.monthlyUsd, 19);
  assert.equal(plan.rendersPerMonth, 40);
});
test("only bounded platform settings and setup master data are accepted", () => {
  assert.ok(validatePlatformSettings({ announcement: "Service notice", registrationOpen: false }).value);
  assert.ok(validatePlatformSettings({ announcement: "OK", registrationOpen: true, apiKey: "secret" }).error);
  assert.deepEqual(normalizePublicPlatformConfig(null), { registrationOpen: true, announcement: "" });
  assert.ok(validateMasterItem({ category: "tone", code: "serious", label: "Serious" }).value);
  assert.ok(validateMasterItem({ category: "admin", code: "root", label: "Admin" }).error);
  assert.ok(validateMasterItem({ label: "New name", sortOrder: 2, active: false }, { update: true }).value);
});
