import { test, expect } from "@playwright/test";

// No Paddle sandbox charges or real billing credentials. Signed-webhook
// subscription states are represented by deterministic backend fixtures.
const user = {
  id: "billing-qa-1", email: "billing@example.test",
  emailVerifiedAt: "2026-10-26T00:00:00Z",
  planSelectedAt: "2026-10-26T00:00:00Z",
};
const creator = { id: "creator", name: "Creator", monthlyUsd: 19, rendersPerMonth: 30, maxSeconds: 60 };
const studio = { id: "studio", name: "Studio", monthlyUsd: 49, rendersPerMonth: 150, maxSeconds: 60 };
const free = { id: "free", name: "Free", monthlyUsd: 0, rendersPerMonth: 3, maxSeconds: 60 };
const transactionId = "txn_01j12345678901234567890123";
function snapshot(overrides = {}) {
  return {
    plan: "studio", status: "active", entitlementStatus: "active",
    renewalDate: "2026-11-26T00:00:00Z",
    billingPeriodStart: "2026-10-26T00:00:00Z",
    billingPeriodEnd: "2026-11-26T00:00:00Z",
    cancellationScheduled: false, cancelEffectiveAt: null,
    billingCycle: { frequency: 1, interval: "month" },
    standardMonthlyUsd: 49, source: "paddle", readOnly: false,
    canManagePayment: true, canCancel: true,
    ...overrides,
  };
}
const paid = {
  id: transactionId, description: "Subscription renewal", origin: "subscription_recurring",
  status: "completed", amountMinor: "4900", currency: "USD",
  billedAt: "2026-10-26T01:30:00Z", invoiceNumber: "123-45678",
  invoiceAvailable: true,
};
const pastDue = {
  id: "txn_01j12345678901234567890124", description: "Subscription renewal",
  status: "past_due", amountMinor: "4900", currency: "USD",
  billedAt: "2026-10-25T00:00:00Z", invoiceNumber: null, invoiceAvailable: false,
};
const activity = [
  { id: "h1", title: "Subscription renewed", type: "subscription_renewed", occurredAt: "2026-10-26T01:30:00Z" },
  { id: "h2", title: "Plan change confirmed", type: "change_activated", occurredAt: "2026-10-25T11:00:00Z", detail: "Creator → Studio" },
  { id: "h3", title: "Payment unsuccessful", type: "payment_failed", occurredAt: "2026-10-24T10:00:00Z" },
];

async function mockBilling(page, state) {
  const actions = [];
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const send = (body, status = 200) => route.fulfill({
      status, contentType: "application/json", body: JSON.stringify(body),
    });
    if (path === "/api/auth/me") return send({ authenticated: true, user });
    if (path === "/api/projects") return send({ projects: [] });
    if (path === "/api/billing/dashboard") return state.failOverview
      ? send({ error: "Billing API is temporarily unavailable." }, 503)
      : send({
          account: {
            plan: state.entitlement || (state.subscription ? studio : free),
            month: "2026-10", used: 12, remaining: 138,
          },
          subscription: state.subscription,
          warnings: state.warnings || [],
        });
    if (path === "/api/billing/plans") return send({ plans: [free, creator, studio], billingReady: true });
    if (path === "/api/billing/dashboard/transactions") {
      if (state.failTransactions) return send({ error: "Paddle transactions unavailable." }, 503);
      if (url.searchParams.has("cursor")) return send({ items: [pastDue], nextCursor: null });
      return send({ items: state.transactions ?? [paid], nextCursor: state.nextCursor || null });
    }
    if (path === "/api/billing/dashboard/activity") {
      if (state.failActivity) return send({ error: "Paddle history unavailable." }, 503);
      return send({ items: state.activity || activity, warnings: state.activityWarnings || [] });
    }
    if (path === `/api/billing/dashboard/invoice/${transactionId}`) {
      actions.push("invoice");
      return send({ url: "https://paddle-production-invoice-service-pdfs.s3.amazonaws.com/test-voxora-invoice.pdf" });
    }
    if (path === "/api/billing/dashboard/manage") {
      const action = url.searchParams.get("action");
      actions.push(action);
      return send({ url: `https://buyer-portal.paddle.com/subscriptions/voxora/${action}?token=test` });
    }
    return send({});
  });
  await page.route("https://buyer-portal.paddle.com/**", route => route.fulfill({
    status: 200, contentType: "text/html",
    body: "<!doctype html><title>Paddle sandbox portal fixture</title><h1>Customer portal</h1>",
  }));
  await page.route("https://paddle-production-invoice-service-pdfs.s3.amazonaws.com/**", route => route.fulfill({
    status: 200, contentType: "text/html",
    body: "<!doctype html><title>Paddle invoice fixture</title><h1>Paid invoice</h1>",
  }));
  return actions;
}

test("active Studio subscription clearly shows billing period, renewal, allowances and current price", async ({ page }) => {
  await mockBilling(page, { subscription: snapshot() });
  await page.goto("/billing");
  await expect(page.getByRole("heading", { name: "Billing, made clear." })).toBeVisible();
  const overview = page.getByRole("region", { name: "Subscription overview" });
  await expect(overview).toContainText("Studio");
  await expect(overview).toContainText("$49.00");
  await expect(overview).toContainText("Nov 26, 2026");
  await expect(overview).toContainText("Auto-renewal");
  await expect(page.getByRole("progressbar", { name: "Monthly video renders used" })).toHaveAttribute("aria-valuenow", "12");
  await expect(page.getByRole("heading", { name: "Invoices & transactions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Billing activity" })).toBeVisible();
});

test("transactions show actual Paddle amounts, filtering, pagination and PDF invoice", async ({ page }) => {
  const state = { subscription: snapshot(), nextCursor: transactionId };
  const actions = await mockBilling(page, state);
  await page.goto("/billing");
  const rows = page.locator(".billing-transaction");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("$49.00");
  await expect(rows.first()).toContainText("123-45678");
  await page.getByRole("button", { name: "Load more transactions" }).click();
  await expect(rows).toHaveCount(2);
  await page.getByRole("button", { name: "Payment issues" }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Past due");
  await page.getByRole("button", { name: "All payments" }).click();
  await page.getByRole("button", { name: "View PDF invoice" }).click();
  await expect(page).toHaveURL(/paddle-production-invoice-service-pdfs.s3.amazonaws.com/);
  expect(actions).toContain("invoice");
});

test("overdue subscription offers safe payment recovery without a second checkout", async ({ page }) => {
  const state = {
    subscription: snapshot({ status: "past_due", entitlementStatus: "past_due", canCancel: false }),
    entitlement: free, transactions: [pastDue],
  };
  const actions = await mockBilling(page, state);
  await page.goto("/billing");
  await expect(page.locator(".billing-past-due")).toContainText("Payment needs attention");
  await expect(page.getByRole("button", { name: "Resolve payment in Paddle" })).toBeVisible();
  await page.getByRole("button", { name: "Resolve payment in Paddle" }).click();
  await expect(page).toHaveURL(/buyer-portal.paddle.com.*retry/);
  expect(actions).toContain("retry");
});

test("scheduled cancellation shows effective date and retains access without a second cancellation", async ({ page }) => {
  await mockBilling(page, {
    subscription: snapshot({
      cancellationScheduled: true, cancelEffectiveAt: "2026-11-26T00:00:00Z",
      renewalDate: null, canCancel: false,
    }),
  });
  await page.goto("/billing");
  await expect(page.getByText("Cancellation scheduled").first()).toBeVisible();
  await expect(page.getByText("Access continues until", { exact: true })).toBeVisible();
  await expect(page.getByText("Nov 26, 2026").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel subscription" })).toHaveCount(0);
  await expect(page.getByText("Your Studio plan will stop", { exact: false })).toBeVisible();
});

test("cancellation confirmation keeps subscription unless customer explicitly continues to Paddle", async ({ page }) => {
  const actions = await mockBilling(page, { subscription: snapshot() });
  await page.goto("/billing");
  await page.getByRole("button", { name: "Cancel subscription" }).click();
  await expect(page.getByRole("dialog", { name: "Cancel your Studio plan?" })).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Nov 26, 2026");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel subscription" }).click();
  await page.getByRole("button", { name: "Keep subscription" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(actions).not.toContain("cancel");
  await page.getByRole("button", { name: "Cancel subscription" }).click();
  await page.getByRole("button", { name: "Continue to Paddle" }).click();
  await expect(page).toHaveURL(/buyer-portal.paddle.com.*cancel/);
  expect(actions).toContain("cancel");
});

test("partial Paddle outages preserve subscription information and explicit retry guidance", async ({ page }) => {
  await mockBilling(page, {
    subscription: snapshot({ source: "local", readOnly: true, canManagePayment: false, canCancel: false }),
    warnings: ["Live Paddle billing dates are temporarily unavailable."],
    failTransactions: true, failActivity: true,
  });
  await page.goto("/billing");
  await expect(page.getByRole("heading", { name: "Billing, made clear." })).toBeVisible();
  await expect(page.getByText("Live Paddle billing dates are temporarily unavailable.", { exact: false })).toBeVisible();
  await expect(page.getByText("Paddle transactions unavailable.", { exact: false })).toBeVisible();
  await expect(page.getByText("Paddle history unavailable.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Update payment method" })).toBeDisabled();
});

test("Free plan has a clear upgrade path and no fabricated subscription or receipts", async ({ page }) => {
  await mockBilling(page, {
    subscription: null, entitlement: free, transactions: [], activity: [],
  });
  await page.goto("/billing");
  await expect(page.getByRole("region", { name: "Subscription overview" })).toContainText("Free");
  await expect(page.getByRole("link", { name: "Explore plans" })).toBeVisible();
  await expect(page.getByText("No Paddle transactions have been recorded", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel subscription" })).toHaveCount(0);
});
