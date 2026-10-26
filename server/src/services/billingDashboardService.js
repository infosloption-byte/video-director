import { PLANS, priceId } from "./billingService.js";

export const TRANSACTION_ID = /^txn_[a-z0-9]{20,100}$/;
export const SUBSCRIPTION_ID = /^sub_[a-z0-9]{20,100}$/;
const CURSOR = /^txn_[a-z0-9]{20,100}$/;
export const MANAGEMENT_ACTIONS = Object.freeze(["overview", "payment", "retry", "cancel"]);

const TIMEOUT_MS = 12000;
export async function paddleList(path, params = new URLSearchParams(), options = {}) {
  const base = String(process.env.PADDLE_ENV || "sandbox").toLowerCase() === "live"
    ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
  if (!String(path).startsWith("/") || String(path).startsWith("//")) throw new Error("Invalid Paddle path.");
  const query = params.toString();
  const response = await fetch(base + path + (query ? `?${query}` : ""), {
    method: "GET",
    headers: { Authorization: `Bearer ${process.env.PADDLE_API_KEY}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(options.timeoutMs || TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`Paddle API request failed (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function cursorFromMeta(meta) {
  if (!meta?.pagination?.has_more || !meta?.pagination?.next) return null;
  try {
    const parsed = new URL(meta.pagination.next);
    const id = parsed.searchParams.get("after");
    return CURSOR.test(id || "") ? id : null;
  } catch { return null; }
}

export function cleanTransaction(row) {
  const minor = row?.details?.totals?.total;
  const billedAt = row?.billed_at || row?.created_at || null;
  return {
    id: String(row.id),
    status: String(row.status || "unknown"),
    origin: String(row.origin || "unknown"),
    invoiceNumber: row.invoice_number || null,
    amountMinor: /^-?\d+$/.test(String(minor ?? "")) ? String(minor) : null,
    currency: /^[A-Z]{3}$/.test(String(row.currency_code || "")) ? row.currency_code : "USD",
    billedAt,
    completedAt: row?.updated_at || null,
    description: ({
      subscription_recurring: "Subscription renewal",
      subscription_update: "Subscription plan change",
      subscription_charge: "Subscription charge",
      subscription_payment_method_change: "Payment method update",
      api: "Subscription purchase",
    })[row.origin] || "Subscription transaction",
    invoiceAvailable: row.status === "completed" && Number(minor) > 0,
  };
}

export function subscriptionSnapshot(local, remote) {
  if (!local) return null;
  // The local signed-webhook state still controls entitlements. Paddle is
  // consulted for fresh billing dates and management details, never to grant access.
  const valid = remote && remote.id === local.paddleSubscriptionId;
  const period = valid ? remote.current_billing_period : null;
  const change = valid ? remote.scheduled_change : null;
  const cancelScheduled = change?.action === "cancel" || (!valid && local.cancelAtPeriodEnd);
  return {
    plan: local.plan,
    status: valid ? remote.status : local.status,
    entitlementStatus: local.status,
    billingPeriodStart: period?.starts_at || null,
    billingPeriodEnd: period?.ends_at || local.periodEnd || null,
    renewalDate: valid && !cancelScheduled ? remote.next_billed_at || null : null,
    cancellationScheduled: Boolean(cancelScheduled),
    cancelEffectiveAt: change?.action === "cancel" ? change.effective_at : (local.cancelAtPeriodEnd ? local.periodEnd : null),
    canceledAt: valid ? remote.canceled_at : null,
    billingCycle: valid ? remote.billing_cycle : null,
    collectionMode: valid ? remote.collection_mode : null,
    currency: valid ? remote.currency_code : null,
    standardMonthlyUsd: PLANS[local.plan]?.monthlyUsd ?? null,
    source: valid ? "paddle" : "local",
    readOnly: !valid || remote.status === "canceled",
    canManagePayment: Boolean(valid && ["active","trialing","past_due"].includes(remote.status)),
    canCancel: Boolean(valid && ["active","trialing"].includes(remote.status) && !cancelScheduled),
  };
}

export function paddlePlanMismatch(remote, local) {
  if (!remote || !local) return true;
  // Recognized Voxora subscription price and one base item only.
  const item = remote.items?.[0];
  return remote.id !== local.paddleSubscriptionId
    || !Array.isArray(remote.items) || remote.items.length !== 1
    || item?.quantity !== 1
    || item?.price?.id !== priceId(local.plan);
}

const HISTORY_LABELS = Object.freeze({
  subscription_created: "Subscription created",
  subscription_activated: "Subscription activated",
  subscription_updated: "Subscription updated",
  subscription_canceled: "Subscription canceled",
  subscription_paused: "Subscription paused",
  subscription_resumed: "Subscription resumed",
  subscription_past_due: "Payment attention required",
  subscription_trialing: "Subscription trial started",
  subscription_payment_method_updated: "Payment method updated",
});

export function billingActivity({ history = [], transactions = [], localChange = null }) {
  const events = [];
  for (const event of history) {
    if (!event?.id || !event?.occurred_at) continue;
    const action = String(event.detail?.action || "");
    const title = HISTORY_LABELS[action] || "Subscription activity";
    events.push({
      id: `history:${event.id}`,
      type: action,
      title,
      occurredAt: event.occurred_at,
      detail: action === "subscription_canceled" && event.detail?.effective_from === "next_billing_period"
        ? "Scheduled for the end of the billing period" : null,
    });
  }
  for (const transaction of transactions) {
    if (!transaction?.id) continue;
    const status = transaction.status;
    if (!["completed", "past_due", "canceled"].includes(status)) continue;
    const title = status === "past_due" ? "Payment unsuccessful"
      : status === "canceled" ? "Transaction canceled"
      : transaction.origin === "subscription_recurring" ? "Subscription renewed"
      : transaction.origin === "subscription_update" ? "Plan change payment completed"
      : "Payment completed";
    events.push({
      id: `transaction:${transaction.id}`,
      type: status === "past_due" ? "payment_failed" : `transaction_${status}`,
      title, occurredAt: transaction.completedAt || transaction.billedAt,
      detail: transaction.invoiceNumber ? `Invoice ${transaction.invoiceNumber}` : null,
    });
  }
  if (localChange?.id && localChange?.requestedAt) {
    const action = localChange.status === "activated" ? "Plan change confirmed"
      : localChange.status === "failed" ? "Plan change payment failed"
      : localChange.status === "uncertain" ? "Plan change awaiting confirmation"
      : "Plan change requested";
    events.push({
      id: `change:${localChange.id}`, title: action, type: `change_${localChange.status}`,
      occurredAt: localChange.requestedAt,
      detail: `${PLANS[localChange.fromPlan]?.name || localChange.fromPlan} → ${PLANS[localChange.toPlan]?.name || localChange.toPlan}`,
    });
  }
  return events
    .filter(e => e.occurredAt && !Number.isNaN(Date.parse(e.occurredAt)))
    .sort((a,b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, 25);
}

export function invoiceBelongsToUser(transaction, local, checkout, userId) {
  if (!transaction?.id || !TRANSACTION_ID.test(transaction.id)) return false;
  const sameSub = Boolean(local && local.userId === userId
    && transaction.subscription_id === local.paddleSubscriptionId);
  const sameCheckout = Boolean(checkout && checkout.userId === userId
    && checkout.transactionId === transaction.id);
  if (!sameSub && !sameCheckout) return false;
  // An old checkout may be linked to a previous subscription, but must not
  // unlock unrelated Paddle invoices on the shared BuildHire merchant account.
  if (sameCheckout && transaction.subscription_id && !sameSub)
    return checkout.paddleSubscriptionId === transaction.subscription_id;
  return true;
}

export function paymentManagementUrl(remote, action) {
  if (!MANAGEMENT_ACTIONS.includes(action)) return null;
  const links = remote?.management_urls || {};
  const target = action === "overview" ? links.view_subscription || links.update_payment_method
    : action === "cancel" ? links.cancel : links.update_payment_method;
  if (typeof target !== "string") return null;
  try {
    const url = new URL(target);
    // Never open an arbitrary URL from stored customer data.
    if (url.protocol !== "https:" || !/^(?:[a-z0-9-]+\.)*paddle\.com$/.test(url.hostname)) return null;
    return target;
  } catch { return null; }
}
