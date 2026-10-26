import { test, expect } from "@playwright/test";

// These tests never call real Gmail, Paddle or the production API. Browser
// journeys use deterministic HTTP fixtures, including service failures.
const plans = [
  { id: "free", name: "Free", rendersPerMonth: 3, maxSeconds: 60, monthlyUsd: 0 },
  { id: "creator", name: "Creator", rendersPerMonth: 30, maxSeconds: 60, monthlyUsd: 19 },
  { id: "studio", name: "Studio", rendersPerMonth: 150, maxSeconds: 60, monthlyUsd: 49 },
];
const account = (overrides = {}) => ({
  id: "test-user-1", email: "browser-test@example.test",
  displayName: "Voxora QA", emailVerifiedAt: null, planSelectedAt: null,
  intendedPlan: "studio", createdAt: "2026-10-26T00:00:00Z",
  preferences: {}, ...overrides,
});

async function mockAccountApi(page, overrides = {}) {
  const state = {
    user: null, emailSent: true, resendFailures: 0, resetExpired: false,
    ...overrides,
  };
  await page.route("**/api/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();
    const json = (data, status = 200) => route.fulfill({
      status, contentType: "application/json", body: JSON.stringify(data),
    });
    const payload = () => JSON.parse(req.postData() || "{}");

    if (path === "/api/auth/me") return json({ authenticated: !!state.user, user: state.user });
    if (path === "/api/auth/signup" && method === "POST") {
      state.user = account({ email: payload().email, intendedPlan: payload().intendedPlan });
      return json({ user: state.user, emailSent: state.emailSent, emailVerificationRequired: true }, 201);
    }
    if (path === "/api/auth/signin" && method === "POST") {
      state.user = state.signedInUser || account({ emailVerifiedAt: "2026-10-26T00:00:00Z", planSelectedAt: "2026-10-26T00:00:00Z" });
      return json({ user: state.user });
    }
    if (path === "/api/auth/signout") { state.user = null; return json({ ok: true }); }
    if (path === "/api/auth/verify-code" && method === "POST") {
      if (payload().code !== "123456") return json({ error: "That code is incorrect or expired." }, 400);
      state.user = { ...state.user, emailVerifiedAt: "2026-10-26T00:00:00Z" };
      return json({ user: state.user });
    }
    if (path === "/api/auth/verify-email" && method === "POST") {
      if (payload().token === "expired") return json({ error: "This verification link is invalid or expired." }, 400);
      state.user = { ...state.user, emailVerifiedAt: "2026-10-26T00:00:00Z" };
      return json({ user: state.user });
    }
    if (path === "/api/auth/resend-verification") {
      if (state.resendFailures > 0) { state.resendFailures -= 1; return json({ error: "The email could not be sent. Please try again shortly." }, 503); }
      return json({ message: "A new code has been sent.", retryAfterSeconds: 60 });
    }
    if (path === "/api/auth/forgot-password") return json({ message: "If an account exists for that email, a reset link has been prepared." });
    if (path === "/api/auth/reset-password") {
      if (state.resetExpired || payload().token === "expired") return json({ error: "This reset link is invalid or expired." }, 400);
      state.user = state.signedInUser || account({ emailVerifiedAt: "2026-10-26T00:00:00Z", planSelectedAt: "2026-10-26T00:00:00Z" });
      return json({ user: state.user });
    }
    if (path === "/api/billing/plans") return json({ plans, billingReady: false, provisionalPricing: true });
    if (path === "/api/billing/me") return json({ plan: plans[0], used: 0, remaining: 3, month: "2026-10", subscription: null });
    if (path === "/api/account/sessions") return json({ sessions: [] });
    if (path === "/api/account/preferences") return json({ preferences: {} });
    // Unrelated workspace endpoints are irrelevant to these authentication tests.
    return json({});
  });
  return state;
}

test("preserves Studio intent through registration, Gmail failure, resend and code verification", async ({ page }) => {
  await mockAccountApi(page, { emailSent: false, resendFailures: 1 });
  await page.goto("/choose-plan?plan=studio");
  await expect(page).toHaveURL(/\/signin\?next=/);
  // Use the form-specific signup link; the public header also has a CTA.
  await page.locator(".auth-card__switch").getByRole("link", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/signup\?next=/);
  await page.getByLabel("Email address").fill("browser-test@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Astrong-password-123");
  await page.getByLabel("Confirm password").fill("Astrong-password-123");
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/verify-email\?next=/);
  await expect(page.getByText("Gmail did not accept", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Resend code" }).click();
  await expect(page.getByText("The email could not be sent", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Resend code" }).click();
  await expect(page.getByText("A new code is on its way")).toBeVisible();
  await page.getByRole("textbox", { name: "6-digit verification code" }).fill("123456");
  await expect(page).toHaveURL(/\/choose-plan\?plan=studio/);
  await expect(page.locator(".plan-select__card.is-highlighted").getByRole("heading", { name: "Studio" })).toBeVisible();
});

test("desktop and mobile header signup links keep the chosen Studio plan", async ({ page }) => {
  await mockAccountApi(page);
  await page.goto("/signin?next=%2Fchoose-plan%3Fplan%3Dstudio");

  if (page.viewportSize().width <= 960) {
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await page.locator(".ph__panel-actions").getByRole("link", { name: "Create account" }).click();
  } else {
    await page.locator(".ph__actions").getByRole("link", { name: "Create account" }).click();
  }
  await expect(page).toHaveURL(/\/signup\?next=/);
  await expect(page).toHaveURL(/plan%3Dstudio/);
});

test("sign-in resumes paid onboarding rather than dropping the intended Creator plan", async ({ page }) => {
  await mockAccountApi(page, {
    signedInUser: account({ intendedPlan: "creator", emailVerifiedAt: "2026-10-26T00:00:00Z" }),
  });
  await page.goto("/signin");
  await page.getByLabel("Email address").fill("browser-test@example.test");
  await page.getByLabel("Password", { exact: true }).fill("ExamplePass-1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/choose-plan\?plan=creator/);
  await expect(page.locator(".plan-select__card.is-highlighted").getByRole("heading", { name: "Creator" })).toBeVisible();
});

test("expired verification link directs signed-in users to code resend without losing intent", async ({ page }) => {
  await mockAccountApi(page, { user: account({ intendedPlan: "studio" }) });
  await page.goto("/verify-email?token=expired");
  await expect(page.getByText("This verification link is invalid or expired.")).toBeVisible();
  await page.getByRole("link", { name: "Request a new code" }).click();
  await expect(page.getByRole("button", { name: "Resend code" })).toBeVisible();
});

test("forgot password, expired reset link and successful password reset", async ({ page }) => {
  await mockAccountApi(page);
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("browser-test@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("If an account exists for that email", { exact: false })).toBeVisible();
  await page.goto("/reset-password?token=expired");
  await page.getByLabel("New password").fill("NewPassword1234");
  await page.getByLabel("Confirm password").fill("NewPassword1234");
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByRole("link", { name: "Request a new reset link" })).toBeVisible();
  await page.goto("/reset-password?token=valid");
  await page.getByLabel("New password").fill("NewPassword1234");
  await page.getByLabel("Confirm password").fill("NewPassword1234");
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page).toHaveURL(/\/my-research/);
});

test("missing reset token offers a safe recovery path", async ({ page }) => {
  await mockAccountApi(page);
  await page.goto("/reset-password");
  await expect(page.getByText("Your password-reset link is missing")).toBeVisible();
  await page.getByRole("link", { name: "Request a new reset link" }).click();
  await expect(page).toHaveURL(/\/forgot-password/);
});

test("expired session on a protected page sends user to sign-in with a return destination", async ({ page }) => {
  const state = await mockAccountApi(page, {
    user: account({ emailVerifiedAt: "2026-10-26T00:00:00Z", planSelectedAt: "2026-10-26T00:00:00Z", intendedPlan: null }),
  });
  await page.goto("/settings?tab=security");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  state.user = null;
  await page.reload();
  await expect(page).toHaveURL(/\/signin\?next=/);
  await expect(page.getByRole("heading", { name: "Welcome to your workspace." })).toBeVisible();
});
