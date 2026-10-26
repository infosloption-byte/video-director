import test from "node:test";
import assert from "node:assert/strict";
import { quotaView } from "../src/lib/renderQuota.js";

test("quota usage warns at 80 percent and blocks at 100 percent", () => {
  const plan = { rendersPerMonth: 30 };
  assert.deepEqual([0, 24, 30].map(used => {
    const view = quotaView({ plan, used, remaining: 30 - used, month: "2026-10" });
    return [view.percent, view.approaching, view.exhausted];
  }), [[0, false, false], [80, true, false], [100, false, true]]);
});

test("UTC monthly reset handles year boundaries and includes zero-free credits", () => {
  assert.equal(quotaView({ plan: { rendersPerMonth: 150 }, used: 80, remaining: 70, month: "2026-12" }).resetAt, "2027-01-01T00:00:00.000Z");
  assert.equal(quotaView({ plan: { rendersPerMonth: 3 }, used: 0, remaining: 3, month: "2026-10" }).resetAt, "2026-11-01T00:00:00.000Z");
  assert.equal(quotaView({ plan: { rendersPerMonth: 3 }, used: 1, remaining: 2, month: "bad" }).resetAt, null);
});

test("render blocked by duration still prompts an upgrade even with credits left", () => {
  const view = quotaView({ plan: { rendersPerMonth: 30 }, used: 4, remaining: 26, month: "2026-10" }, true);
  assert.equal(view.blocked, true);
  assert.equal(view.exhausted, false);
  assert.equal(view.remaining, 26);
});

test("credits and percentages are clamped without over-promising allowances", () => {
  const view = quotaView({ plan: { rendersPerMonth: 3 }, used: 10, remaining: -7, month: "2026-10" });
  assert.equal(view.percent, 100);
  assert.equal(view.remaining, 0);
});
