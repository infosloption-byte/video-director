import test from "node:test";
import assert from "node:assert/strict";
import { CURRENT_LEGAL_VERSION } from "../src/services/legalConsent.js";

test("signup and voice consent refer to a stable policy version", () => {
  assert.match(CURRENT_LEGAL_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(CURRENT_LEGAL_VERSION, "2026-10-24");
});
