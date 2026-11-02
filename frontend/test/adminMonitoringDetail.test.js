import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL("../src/" + path, import.meta.url), "utf8");
test("resource and economics routes use the guarded admin analytics area", async () => {
  const [app, shell, router] = await Promise.all([
    read("App.jsx"), read("components/AdminShell.jsx"),
    readFile(new URL("../../server/src/routes/adminAnalytics.js", import.meta.url), "utf8"),
  ]);
  for (const path of ["/admin/analytics/infrastructure", "/admin/analytics/economics"]) {
    assert.ok(app.includes('path="' + path + '"'));
    assert.ok(shell.includes('path: "' + path + '"'));
  }
  assert.match(app, /<PlatformAdminRoute><AdminAnalyticsPage key="infrastructure"/);
  assert.match(app, /<PlatformAdminRoute><AdminAnalyticsPage key="economics"/);
  assert.match(router, /router.get\("\/infrastructure"/);
  assert.match(router, /router.get\("\/economics"/);
});
test("detailed monitoring declares limits, costs, unknown revenue and GPU opt-in", async () => {
  const page = await read("pages/AdminMonitoringDetail.jsx");
  assert.match(page, /No data recorded yet/);
  assert.match(page, /Awaiting reconciled Paddle revenue/);
  assert.match(page, /GPU telemetry has not been configured or received yet/);
  assert.match(page, /Estimated compute allocation/);
  assert.match(page, /Not available/);
});
test("date controls include valid one-day/seven-day infrastructure history", async () => {
  const page = await read("pages/AdminAnalyticsPage.jsx");
  assert.match(page, /view === "infrastructure" \? 7 : 30/);
  assert.match(page, /view === "infrastructure" \? \[1, 7\]/);
  assert.match(page, /AdminMonitoringDetail view=\{view\}/);
});
