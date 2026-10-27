import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isPlatformAdmin, requirePlatformAdmin } from "../src/middleware/platformAdmin.js";

const admin = { id: "admin-id", role: "platform_admin", emailVerifiedAt: new Date() };
const user = { id: "user-id", role: "user", emailVerifiedAt: new Date() };

test("platform admin requires explicit verified database role", () => {
  assert.equal(isPlatformAdmin(admin), true);
  assert.equal(isPlatformAdmin(user), false);
  assert.equal(isPlatformAdmin({ ...admin, emailVerifiedAt: null }), false);
  assert.equal(isPlatformAdmin({ ...admin, id: "" }), false);
  assert.equal(isPlatformAdmin({ ...admin, role: "PLATFORM_ADMIN" }), false);
  assert.equal(isPlatformAdmin(null), false);
});

test("administrator route rejects customer sessions and unverified roles", () => {
  for (const actor of [user, null, { ...admin, emailVerifiedAt: null }]) {
    let status;
    const res = { status(code) { status = code; return this; }, json(body) { assert.equal(body.code, "PLATFORM_ADMIN_REQUIRED"); } };
    let nextCalled = false;
    requirePlatformAdmin({ user: actor, authSession: { id: "session" } }, res, () => { nextCalled = true; });
    assert.equal(status, 403);
    assert.equal(nextCalled, false);
  }
});

test("admin requires a real session and accepts verified admin sessions", () => {
  let passed = false;
  requirePlatformAdmin({ user: admin, authSession: { id: "session" } }, {}, () => { passed = true; });
  assert.equal(passed, true);
  let denied = false;
  const res = { status(n) { assert.equal(n, 403); return this; }, json() { denied = true; } };
  requirePlatformAdmin({ user: admin, authSession: null }, res, () => {});
  assert.equal(denied, true);
});

test("public authentication cannot assign or echo unvalidated administrator privileges", () => {
  const auth = readFileSync("src/routes/auth.js", "utf8");
  const app = readFileSync("src/app.js", "utf8");
  assert.match(auth, /role: user\.role === "platform_admin"/);
  assert.match(app, /app\.use\("\/api\/platform-admin", requireAuth, requirePlatformAdmin, platformAdminRouter\)/);
  assert.doesNotMatch(auth.slice(auth.indexOf('router.post("/signup"'), auth.indexOf('router.post("/signin"')), /req\.body\?\.role|req\.body\.role/);
});
