import test from "node:test";
import assert from "node:assert/strict";
import { normalizeIntendedPlan } from "../src/services/onboardingPlan.js";

test("signup accepts only the three known plan identifiers", () => {
  assert.equal(normalizeIntendedPlan("free"), "free");
  assert.equal(normalizeIntendedPlan("creator"), "creator");
  assert.equal(normalizeIntendedPlan("studio"), "studio");
  for (const invalid of ["enterprise", "CREATOR", "", "studio;DROP", null, undefined]) {
    assert.equal(normalizeIntendedPlan(invalid), null);
  }
});
