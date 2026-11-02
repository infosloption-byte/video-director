import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("analytics dashboards remain behind platform-admin guarded routes", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  for (const route of ["/admin/analytics", "/admin/analytics/pipeline",
    "/admin/analytics/users", "/admin/analytics/costs", "/admin/analytics/user/:userId"]) {
    assert.ok(app.includes('path="' + route + '"'));
  }
  assert.match(app, /<PlatformAdminRoute><AdminAnalyticsPage/);
});

test("admin sidebar exposes the operational reporting pages", async () => {
  const shell = await readFile(new URL("../src/components/AdminShell.jsx", import.meta.url), "utf8");
  for (const label of ["Operations", "Pipeline Timings", "User Usage", "Costs & Providers"]) {
    assert.ok(shell.includes('label: "' + label + '"'));
  }
});

test("cost dashboard labels unknown cost honestly and lets users select date ranges", async () => {
  const page = await readFile(new URL("../src/pages/AdminAnalyticsPage.jsx", import.meta.url), "utf8");
  assert.match(page, /Not measured/);
  assert.match(page, /Cost attribution is not yet complete/);
  assert.match(page, /\[7, 30, 90\]/);
  assert.match(page, /\/api\/platform-admin\/analytics/);
});

test("platform activity table accepts non-project audit events", async () => {
  const page = await readFile(new URL("../src/pages/PlatformAdminPage.jsx", import.meta.url), "utf8");
  assert.match(page, /a\.projectId \?/);
  assert.match(page, /a\.source/);
  assert.match(page, /Activity date range/);
});
