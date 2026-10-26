import { test, expect } from "@playwright/test";

// Deterministic frontend tests: no real Paddle payments or real user accounts.
// API responses simulate server state written only by signed Paddle events.
const transactionId = "txn_01j12345678901234567890123";
const plans = [
  { id: "free", name: "Free", rendersPerMonth: 3, maxSeconds: 60, monthlyUsd: 0 },
  { id: "creator", name: "Creator", rendersPerMonth: 30, maxSeconds: 60, monthlyUsd: 19 },
  { id: "studio", name: "Studio", rendersPerMonth: 150, maxSeconds: 60, monthlyUsd: 49 },
];
const user = { id: "qa-1", email: "qa@example.test", displayName: "QA",
  emailVerifiedAt: "2026-10-26T00:00:00Z", planSelectedAt: "2026-10-26T00:00:00Z" };

async function mockedPaymentApi(page, state) {
  let checkoutCalls = 0;
  let changeCalls = 0;
  let cancelCalls = 0;
  await page.route("https://cdn.paddle.com/paddle/v2/paddle.js", route => route.fulfill({
    status: 200, contentType: "application/javascript",
    body: `window.Paddle = { Initialized: false,
      Environment: { set() {} },
      Initialize(options) { this.Initialized = true; this.eventCallback = options.eventCallback; },
      Checkout: { open(options) { window.__lastPaddleOpen = options; }, close() {} }
    };`,
  }));
  await page.route("**/api/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const send = (data, status = 200) => route.fulfill({
      status, contentType: "application/json", body: JSON.stringify(data),
    });
    if (path === "/api/auth/me") return send({ authenticated: true, user });
    if (path === "/api/billing/plans") return send({ plans, billingReady: true });
    if (path === "/api/billing/me") return send({
      plan: plans.find(p => p.id === state.currentPlan), used: 0, remaining: 30,
      subscription: state.currentPlan === "free" ? null
        : { status: "active", paddleSubscriptionId: "sub_01aa", cancelAtPeriodEnd: false },
    });
    if (path === "/api/billing/payment-state") return send({
      creating: false, checkout: state.checkout, change: state.change,
    });
    if (path === "/api/billing/checkout") {
      checkoutCalls += 1;
      // Server *always* returns same transaction after a closed checkout.
      return send({
        transactionId, plan: "creator", resumed: true, status: "awaiting_payment",
        environment: "sandbox", clientToken: "test_qa_client",
      });
    }
    if (path === "/api/billing/checkout/cancel") {
      cancelCalls += 1;
      state.checkout = { ...state.checkout, status: "canceled", resumable: false };
      return send({ canceled: true, status: "canceled" });
    }
    if (path === "/api/billing/change-preview") {
      return send({
        fromPlan: "creator", toPlan: "studio", mode: "prorated_immediately",
        currency: "USD",
        immediate: { total: "2500" }, next: { total: "4900" },
      });
    }
    if (path === "/api/billing/change-plan") {
      changeCalls += 1;
      state.change = { ...state.change, plan: "studio", status: "processing" };
      return send({ pending: true, plan: "studio" }, 202);
    }
    return send({});
  });
  return { checkoutCalls: () => checkoutCalls, changeCalls: () => changeCalls, cancelCalls: () => cancelCalls };
}

test("closed checkout resumes the original Paddle transaction, not a second purchase", async ({ page }) => {
  const state = {
    currentPlan: "free", change: null,
    checkout: { transactionId, plan: "creator", status: "awaiting_payment", resumable: true },
  };
  const stats = await mockedPaymentApi(page, state);
  await page.goto("/choose-plan?mode=upgrade");
  await expect(page.getByRole("heading", { name: "Creator checkout is still available" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume checkout" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay for Studio" })).toBeDisabled();
  await page.getByRole("button", { name: "Resume checkout" }).click();
  await expect.poll(() => page.evaluate(() => window.__lastPaddleOpen?.transactionId)).toBe(transactionId);
  expect(stats.checkoutCalls()).toBe(1);
  await page.reload();
  await expect(page.getByRole("button", { name: "Resume checkout" })).toBeVisible();
});

test("Paddle checkout completion displays processing until signed subscription activation", async ({ page }) => {
  const state = {
    currentPlan: "free", change: null,
    checkout: { transactionId, plan: "creator", status: "awaiting_payment", resumable: true },
  };
  await mockedPaymentApi(page, state);
  await page.goto("/choose-plan");
  await page.getByRole("button", { name: "Resume checkout" }).click();
  await expect.poll(() => page.evaluate(() => window.__lastPaddleOpen?.transactionId)).toBe(transactionId);
  await page.evaluate(id => window.Paddle.eventCallback({
    name: "checkout.completed", data: { transaction_id: id },
  }), transactionId);
  await expect(page).toHaveURL(/\/payment-result\?type=checkout/);
  await expect(page.getByRole("heading", { name: "Checking your payment…" })).toBeVisible();
  await expect(page.getByText("Payment successful!")).toHaveCount(0);

  state.checkout = { ...state.checkout, status: "activated" };
  state.currentPlan = "creator";
  await expect(page.getByRole("heading", { name: "Payment successful!" })).toBeVisible({ timeout: 12000 });
  await expect(page.getByText(/Redirecting to your workspace in \d+ seconds/)).toBeVisible();
});

test("payment failure remains recoverable using the same transaction", async ({ page }) => {
  const state = {
    currentPlan: "free", change: null,
    checkout: { transactionId, plan: "creator", status: "failed", resumable: true },
  };
  await mockedPaymentApi(page, state);
  await page.goto("/choose-plan");
  await expect(page.getByText("Paddle reported an unsuccessful payment attempt", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume checkout" })).toBeEnabled();
});

test("cancel an unpaid checkout at Paddle before choosing a different plan", async ({ page }) => {
  const state = {
    currentPlan: "free", change: null,
    checkout: { transactionId, plan: "creator", status: "awaiting_payment", resumable: true },
  };
  const stats = await mockedPaymentApi(page, state);
  await page.goto("/choose-plan");
  await page.getByRole("button", { name: "Cancel unpaid checkout" }).click();
  await expect(page.getByRole("dialog", { name: /Cancel this unpaid transaction/ })).toBeVisible();
  await page.getByRole("button", { name: "Cancel unpaid transaction" }).click();
  await expect(page.getByText("The unpaid transaction was canceled at Paddle", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay for Studio" })).toBeEnabled();
  expect(stats.cancelCalls()).toBe(1);
  expect(stats.checkoutCalls()).toBe(0);
});

test("unknown pending payment blocks a second checkout after reload", async ({ page }) => {
  const state = { currentPlan: "free", checkout: null, change: null };
  await mockedPaymentApi(page, state);
  await page.route("**/api/billing/payment-state", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ creating: true, checkout: null, change: null }),
  }));
  await page.goto("/choose-plan");
  await expect(page.getByText("A previous checkout request is awaiting reconciliation", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay for Creator" })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("button", { name: "Pay for Studio" })).toBeDisabled();
});

test("pending upgrade gets one readable result page, failure retry and signed activation", async ({ page }) => {
  const state = {
    currentPlan: "creator", checkout: null,
    change: { plan: "studio", fromPlan: "creator", status: "processing" },
  };
  const stats = await mockedPaymentApi(page, state);
  await page.goto("/choose-plan?mode=upgrade");
  await expect(page).toHaveURL(/\/payment-result\?type=change/);
  await expect(page.getByRole("heading", { name: "Checking your payment…" })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/payment-result\?type=change/);

  state.change = { ...state.change, status: "failed" };
  await expect(page.getByRole("heading", { name: "Your payment wasn't successful." })).toBeVisible({ timeout: 12000 });
  await page.getByRole("button", { name: "Back to plans and retry" }).click();
  await expect(page.getByRole("button", { name: "Review and retry" })).toBeVisible();
  await page.getByRole("button", { name: "Review and retry" }).click();
  await expect(page.getByRole("dialog", { name: /Change from Creator to Studio/ })).toBeVisible();
  await page.getByRole("button", { name: "Confirm plan change" }).click();
  await expect(page).toHaveURL(/\/payment-result\?type=change/);
  expect(stats.changeCalls()).toBe(1);

  state.change = { ...state.change, status: "activated" };
  state.currentPlan = "studio";
  await expect(page.getByRole("heading", { name: "Your plan is updated." })).toBeVisible({ timeout: 12000 });
  await expect(page.getByText("Redirecting to your workspace in", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Go to workspace" }).click();
  await expect(page).toHaveURL(/\/signals$/);
});
