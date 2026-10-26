import { test, expect } from "@playwright/test";

const free = { id: "free", name: "Free", rendersPerMonth: 3, maxSeconds: 60 };
const studio = { id: "studio", name: "Studio", rendersPerMonth: 150, maxSeconds: 60 };

async function fixtures(page) {
  const state = { plan: free, failPreference: false, preferences: {}, billingReads: 0 };
  const user = () => ({
    id: "settings-qa", email: "settings@example.test", displayName: "Settings QA",
    emailVerifiedAt: "2026-10-26T00:00:00Z", planSelectedAt: "2026-10-26T00:00:00Z",
    createdAt: "2026-10-26T00:00:00Z", preferences: { ...state.preferences },
  });
  await page.route("**/api/**", route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const reply = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (path === "/api/auth/me") return reply({ authenticated: true, user: user() });
    if (path === "/api/billing/me") {
      state.billingReads += 1;
      return reply({ plan: state.plan, used: 1, remaining: state.plan.rendersPerMonth - 1 });
    }
    if (path === "/api/account/preferences" && req.method() === "PATCH") {
      if (state.failPreference) return reply({ error: "Preferences could not be saved." }, 503);
      Object.assign(state.preferences, JSON.parse(req.postData() || "{}"));
      return reply({ preferences: { ...state.preferences } });
    }
    if (path === "/api/account/sessions") return reply({ sessions: [] });
    if (path === "/api/billing/plans") return reply({ plans: [free, studio] });
    return reply({});
  });
  return state;
}

test("Settings tabs support arrows, Home, End and named panels", async ({ page }) => {
  await fixtures(page);
  await page.goto("/settings");
  const general = page.getByRole("tab", { name: /General/ });
  const account = page.getByRole("tab", { name: /Account/ });
  await expect(general).toHaveAttribute("aria-selected", "true");
  await general.focus();
  await page.keyboard.press("ArrowDown");
  await expect(account).toBeFocused();
  await expect(account).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: /Account/ })).toBeVisible();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: /Privacy/ })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(general).toBeFocused();
});

test("Account plan and usage refresh after returning to the Settings window", async ({ page }) => {
  const state = await fixtures(page);
  await page.goto("/settings?tab=account");
  await expect(page.getByText("Free plan")).toBeVisible();
  state.plan = studio;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Studio plan")).toBeVisible();
  expect(state.billingReads).toBeGreaterThanOrEqual(2);
});

test("failed preferences remain unchanged and show actionable error", async ({ page }) => {
  const state = await fixtures(page);
  state.failPreference = true;
  await page.goto("/settings?tab=general");
  const control = page.getByRole("switch", { name: "Reduce motion" });
  await expect(control).toHaveAttribute("aria-checked", "false");
  await control.click();
  await expect(page.getByRole("alert")).toContainText("Preferences could not be saved.");
  await expect(control).toHaveAttribute("aria-checked", "false");
});

test("account deletion warns about provider and backup retention", async ({ page }) => {
  await fixtures(page);
  await page.goto("/settings?tab=privacy");
  await expect(page.getByText("Backups and external services may retain information", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Delete account…" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Backups or external providers may retain");
});
