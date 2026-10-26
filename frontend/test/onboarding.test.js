import test from "node:test";
import assert from "node:assert/strict";
import { authPath, destinationFromSearch, onboardingDestination, safeInternalPath, selectedPlanFromDestination, unfinishedPlanDestination, verificationPath } from "../src/lib/onboarding.js";

test("paid selection survives signup, signin and verification query encoding", () => {
  const chosen = "/choose-plan?plan=studio";
  const signin = authPath("/signin", chosen);
  const signup = authPath("/signup", destinationFromSearch(new URL(signin, "https://usevoxora.online").search));
  const verify = verificationPath(destinationFromSearch(new URL(signup, "https://usevoxora.online").search));
  assert.equal(destinationFromSearch(new URL(verify, "https://usevoxora.online").search), chosen);
  assert.equal(selectedPlanFromDestination(chosen), "studio");
});

test("incomplete accounts restore a persisted plan across devices", () => {
  assert.equal(unfinishedPlanDestination({ planSelectedAt: null, intendedPlan: "creator" }, "/my-research"), "/choose-plan?plan=creator");
  assert.equal(unfinishedPlanDestination({ planSelectedAt: null, intendedPlan: null }, "/choose-plan?plan=studio"), "/choose-plan?plan=studio");
  assert.equal(unfinishedPlanDestination({ planSelectedAt: null, intendedPlan: null }, "/my-research"), "/choose-plan");
  assert.equal(unfinishedPlanDestination({ planSelectedAt: "2026-10-26T00:00:00Z", intendedPlan: null }, "/my-research"), "/my-research");
  assert.equal(onboardingDestination("invalid"), "/choose-plan");
});

test("untrusted next parameters cannot redirect users outside Voxora", () => {
  for (const external of ["https://attacker.example", "//attacker.example", "/\\attacker.example", "javascript:alert(1)", "/hello\nWorld"]) {
    assert.equal(safeInternalPath(external), null);
    assert.equal(destinationFromSearch("?next=" + encodeURIComponent(external), "/choose-plan"), "/choose-plan");
  }
});
