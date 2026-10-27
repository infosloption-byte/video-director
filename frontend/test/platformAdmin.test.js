import test from "node:test";
import assert from "node:assert/strict";
import { isPlatformAdminUser } from "../src/lib/platformAdmin.js";

test("platform admin menu requires explicit verified role", () => {
  const user = { id: "1", emailVerifiedAt: "2026-10-27T10:00:00Z" };
  assert.equal(isPlatformAdminUser({ ...user, role: "platform_admin" }), true);
  assert.equal(isPlatformAdminUser({ ...user, role: "user" }), false);
  assert.equal(isPlatformAdminUser({ ...user, role: "platform_admin", emailVerifiedAt: null }), false);
  assert.equal(isPlatformAdminUser({ role: "platform_admin" }), false);
  assert.equal(isPlatformAdminUser(null), false);
});
