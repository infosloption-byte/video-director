import { test, expect } from "@playwright/test";

// This test intentionally runs without the Express backend at localhost:4000.
// Unrelated workspace fetches must use local E2E-only fixtures, never the
// developer proxy or a real customer account.
test("workspace still opens with backend-independent browser-test fixtures", async ({ page }) => {
  await page.route("**/api/auth/me", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      authenticated: true,
      user: {
        id: "test-fixture-user", email: "browser@example.test",
        emailVerifiedAt: "2026-10-26T00:00:00Z",
        planSelectedAt: "2026-10-26T00:00:00Z",
        intendedPlan: null,
      },
    }),
  }));
  await page.goto("/signals");
  await expect(page.getByRole("heading", { name: /Pick a signal/ })).toBeVisible();
  const responses = await page.evaluate(async () => {
    const [projects, signals, integrations] = await Promise.all([
      fetch("/api/projects"),
      fetch("/api/signals?page=1"),
      fetch("/api/health/integrations"),
    ]);
    return {
      statuses: [projects.status, signals.status, integrations.status],
      projects: await projects.json(),
      signals: await signals.json(),
      integrations: await integrations.json(),
    };
  });
  expect(responses.statuses).toEqual([200, 200, 200]);
  expect(responses.projects.projects).toEqual([]);
  expect(responses.signals.signals).toEqual([]);
  expect(responses.integrations.warnings).toEqual([]);
  const unmatched = await page.evaluate(async () => {
    const response = await fetch("/api/never-mocked");
    return { status: response.status, data: await response.json() };
  });
  expect(unmatched.status).toBe(503);
  expect(unmatched.data.error).toMatch(/Unmocked browser-test API/);
});
