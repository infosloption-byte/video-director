import test from "node:test";
import assert from "node:assert/strict";
import { expensiveOperationRateLimit } from "../src/middleware/rateLimit.js";
import {
  billingActivity, cleanTransaction, cursorFromMeta, invoiceBelongsToUser, paddleList,
  paddlePlanMismatch, paymentManagementUrl, subscriptionSnapshot,
} from "../src/services/billingDashboardService.js";

const local = {
  userId: "owner-1", plan: "creator", status: "active",
  paddleSubscriptionId: "sub_01j12345678901234567890123",
  paddleCustomerId: "ctm_01j12345678901234567890123",
  periodEnd: new Date("2026-11-26T00:00:00Z"), cancelAtPeriodEnd: false,
};
const remote = {
  id: local.paddleSubscriptionId, customer_id: local.paddleCustomerId, status: "active",
  currency_code: "USD", collection_mode: "automatic",
  billing_cycle: { interval: "month", frequency: 1 },
  current_billing_period: { starts_at: "2026-10-26T00:00:00Z", ends_at: "2026-11-26T00:00:00Z" },
  next_billed_at: "2026-11-26T00:00:00Z", scheduled_change: null,
  management_urls: {
    view_subscription: "https://buyer-portal.paddle.com/subscriptions/owned/view-subscription?token=temporary",
    update_payment_method: "https://buyer-portal.paddle.com/subscriptions/owned/update-payment-method?token=temporary",
    cancel: "https://buyer-portal.paddle.com/subscriptions/owned/cancel?token=temporary",
  },
  items: [{ quantity: 1, price: { id: "pri_creator_test" } }],
};

test("fresh overview shows renewal, billing cycle and signed entitlement state", () => {
  const overview = subscriptionSnapshot(local, remote);
  assert.equal(overview.plan, "creator");
  assert.equal(overview.status, "active");
  assert.equal(overview.entitlementStatus, "active");
  assert.equal(overview.renewalDate, "2026-11-26T00:00:00Z");
  assert.equal(overview.billingPeriodStart, "2026-10-26T00:00:00Z");
  assert.equal(overview.canCancel, true);
  assert.equal(overview.readOnly, false);
  assert.equal(overview.standardMonthlyUsd, 19);
});

test("Paddle scheduled cancellation stops renewal but retains access through period end", () => {
  const canceled = subscriptionSnapshot(local, {
    ...remote,
    scheduled_change: { action: "cancel", effective_at: "2026-11-26T00:00:00Z" },
    next_billed_at: null,
  });
  assert.equal(canceled.cancellationScheduled, true);
  assert.equal(canceled.cancelEffectiveAt, "2026-11-26T00:00:00Z");
  assert.equal(canceled.renewalDate, null);
  assert.equal(canceled.entitlementStatus, "active");
  assert.equal(canceled.canCancel, false);
  const fallback = subscriptionSnapshot({ ...local, cancelAtPeriodEnd: true }, null);
  assert.equal(fallback.source, "local");
  assert.equal(fallback.canManagePayment, false);
  assert.equal(fallback.cancelEffectiveAt.getUTCDate(), 26);
});

test("wrong subscription items, unknown plans and modified prices fail reconciliation", () => {
  const previous = process.env.PADDLE_PRICE_CREATOR;
  process.env.PADDLE_PRICE_CREATOR = "pri_creator_test";
  try {
    assert.equal(paddlePlanMismatch(remote, local), false);
    assert.equal(paddlePlanMismatch({ ...remote, items: [{ quantity: 2, price: { id: "pri_creator_test" } }] }, local), true);
    assert.equal(paddlePlanMismatch({ ...remote, items: [{ quantity: 1, price: { id: "pri_buildhire" } }] }, local), true);
    assert.equal(paddlePlanMismatch({ ...remote, id: "sub_someone_else" }, local), true);
  } finally {
    if (previous === undefined) delete process.env.PADDLE_PRICE_CREATOR;
    else process.env.PADDLE_PRICE_CREATOR = previous;
  }
});

test("Paddle transaction totals are minor units with invoice availability only when paid", () => {
  const paid = cleanTransaction({
    id: "txn_01j12345678901234567890123", status: "completed", origin: "subscription_recurring",
    invoice_number: "123-45678", currency_code: "USD", created_at: "2026-10-26T00:00:00Z",
    details: { totals: { total: "4900" } },
  });
  assert.equal(paid.amountMinor, "4900");
  assert.equal(paid.description, "Subscription renewal");
  assert.equal(paid.invoiceNumber, "123-45678");
  assert.equal(paid.invoiceAvailable, true);
  const retry = cleanTransaction({
    id: "txn_01j12345678901234567890124", status: "past_due",
    details: { totals: { total: "4900" } },
  });
  assert.equal(retry.invoiceAvailable, false);
  assert.equal(cleanTransaction({ id: "txn_01j12345678901234567890125", status: "completed", details: { totals: { total: "0" } } }).invoiceAvailable, false);
});

test("invoice access requires user-owned subscription or a precisely matching historical checkout", () => {
  const txn = "txn_01j12345678901234567890123";
  const receipt = { id: txn, subscription_id: local.paddleSubscriptionId };
  const checkout = { userId: "owner-1", transactionId: txn, paddleSubscriptionId: local.paddleSubscriptionId };
  assert.equal(invoiceBelongsToUser(receipt, local, null, "owner-1"), true);
  assert.equal(invoiceBelongsToUser(receipt, null, checkout, "owner-1"), true);
  assert.equal(invoiceBelongsToUser(receipt, local, checkout, "owner-2"), false);
  assert.equal(invoiceBelongsToUser({ ...receipt, subscription_id: "sub_buildhire" }, local, checkout, "owner-1"), false);
  assert.equal(invoiceBelongsToUser({ ...receipt, subscription_id: null }, null, checkout, "owner-1"), true);
  assert.equal(invoiceBelongsToUser({ ...receipt, id: "txn_another_transaction" }, null, checkout, "owner-1"), false);
});

test("Paddle portal URLs are allowlisted and never use caller-provided links", () => {
  assert.match(paymentManagementUrl(remote, "cancel"), /^https:\/\/buyer-portal.paddle.com/);
  assert.match(paymentManagementUrl(remote, "payment"), /update-payment-method/);
  assert.equal(paymentManagementUrl(remote, "delete"), null);
  assert.equal(paymentManagementUrl({ ...remote, management_urls: { cancel: "https://phishing.example/steal" } }, "cancel"), null);
  assert.equal(paymentManagementUrl({ ...remote, management_urls: { cancel: "javascript:alert(1)" } }, "cancel"), null);
});

test("newest-first Paddle transactions preserve safe server pagination cursor", () => {
  const id = "txn_01j12345678901234567890123";
  assert.equal(cursorFromMeta({ pagination: { has_more: true, next: `https://api.paddle.com/transactions?after=${id}` } }), id);
  assert.equal(cursorFromMeta({ pagination: { has_more: false, next: `https://api.paddle.com/transactions?after=${id}` } }), null);
  assert.equal(cursorFromMeta({ pagination: { has_more: true, next: "https://api.paddle.com/transactions?after=other" } }), null);
});

test("billing activity includes upgrades, renewals and failed payment events", () => {
  const result = billingActivity({
    history: [{ id: "h1", occurred_at: "2026-10-26T02:00:00Z", detail: { action: "subscription_canceled", effective_from: "next_billing_period" } }],
    transactions: [
      { id: "renewal", origin: "subscription_recurring", status: "completed", completedAt: "2026-10-26T01:00:00Z", invoiceNumber: "456" },
      { id: "failed", origin: "subscription_recurring", status: "past_due", completedAt: "2026-10-25T01:00:00Z" },
    ],
    localChange: { id: "c1", fromPlan: "creator", toPlan: "studio", status: "activated", requestedAt: "2026-10-24T00:00:00Z" },
  });
  assert.deepEqual(result.map(e => e.title), ["Subscription canceled", "Subscription renewed", "Payment unsuccessful", "Plan change confirmed"]);
  assert.match(result.at(-1).detail, /Creator → Studio/);
});

test("Paddle transaction API uses sandbox endpoint, exact filter and bearer auth", async () => {
  const oldFetch = globalThis.fetch, oldKey = process.env.PADDLE_API_KEY, oldEnv = process.env.PADDLE_ENV;
  try {
    process.env.PADDLE_API_KEY = "sandbox_key_for_test";
    process.env.PADDLE_ENV = "sandbox";
    globalThis.fetch = async (url, options) => {
      assert.equal(new URL(url).origin, "https://sandbox-api.paddle.com");
      assert.equal(new URL(url).searchParams.get("subscription_id"), local.paddleSubscriptionId);
      assert.equal(options.headers.Authorization, "Bearer sandbox_key_for_test");
      return { ok: true, status: 200, json: async () => ({ data: [], meta: { pagination: { has_more: false } } }) };
    };
    const result = await paddleList("/transactions", new URLSearchParams({ subscription_id: local.paddleSubscriptionId }));
    assert.deepEqual(result.data, []);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.PADDLE_API_KEY; else process.env.PADDLE_API_KEY = oldKey;
    if (oldEnv === undefined) delete process.env.PADDLE_ENV; else process.env.PADDLE_ENV = oldEnv;
  }
});

test("invoice and portal link generation is throttled by authenticated user", () => {
  let calls = 0;
  const req = {
    user: { id: "billing-rate-limit-test-user" },
    headers: {}, method: "GET", path: "/dashboard/manage", ip: "127.0.0.1",
  };
  const res = {
    statusCode: 200, setHeader() {},
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
  for (let index = 0; index < 12; index += 1) {
    expensiveOperationRateLimit(req, res, () => { calls += 1; });
  }
  assert.equal(calls, 12);
  expensiveOperationRateLimit(req, res, () => { calls += 1; });
  assert.equal(res.statusCode, 429);
  assert.equal(calls, 12);
  res.statusCode = 200;
  expensiveOperationRateLimit({ ...req, user: { id: "another-billing-test-user" } }, res, () => { calls += 1; });
  assert.equal(calls, 13);
});
