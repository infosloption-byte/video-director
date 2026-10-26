import { test, expect } from "@playwright/test";

// A lightweight smoke test for the lazy-loaded voice profile page. GPU/TTS
// requests are not made; this covers initial list loading and route cleanup.
test("voice profiles loads its saved library and returns to the workspace without a running API", async ({ page }) => {
  const user = {
    id: "voice-smoke-user", email: "voice-smoke@example.test",
    emailVerifiedAt: "2026-10-26T00:00:00.000Z",
    planSelectedAt: "2026-10-26T00:00:00.000Z",
  };
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    const send = data => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify(data),
    });
    if (url.pathname === "/api/auth/me") return send({ authenticated: true, user });
    if (url.pathname === "/api/voice-profiles") return send({
      profiles: [], prompts: ["Read the first sample", "Read the second sample"],
      minSamples: 2, maxSamples: 6,
    });
    return send({});
  });

  await page.goto("/voice-profiles");
  await expect(page.getByRole("heading", { name: "Create your narrator voice." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved voice profiles" })).toBeVisible();
  await expect(page.getByText("No voice profiles yet. Start one above.")).toBeVisible();
  await page.goto("/my-research");
  await expect(page).toHaveURL(/\/my-research/);
});
