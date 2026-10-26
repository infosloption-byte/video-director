// Trusted Paddle payment state mapping. Never infer paid access from a browser
// event, a redirect query, or user-controlled custom_data.
export const CHECKOUT_ACTIVE = Object.freeze(["awaiting_payment", "processing", "failed"]);
export const CHANGE_ACTIVE = Object.freeze(["processing", "uncertain"]);
export const CHANGE_FINAL = Object.freeze(["activated", "failed", "canceled"]);
export const PAYMENT_STATES = Object.freeze(["awaiting_payment", "processing", "activated", "failed", "canceled"]);

export function checkoutEventStatus(eventType, previous = "awaiting_payment") {
  if (previous === "activated") return "activated";
  if (eventType === "transaction.completed") return "processing";
  if (eventType === "transaction.payment_failed" || eventType === "transaction.past_due") return "failed";
  if (eventType === "transaction.canceled") return "canceled";
  return previous;
}

export function publicCheckoutStatus(checkout, subscription) {
  if (!checkout) return null;
  const confirmed = Boolean(checkout.paddleSubscriptionId
    && checkout.paddleSubscriptionId === subscription?.paddleSubscriptionId
    && subscription.plan === checkout.plan
    && ["active", "trialing"].includes(subscription.status));
  return {
    transactionId: checkout.transactionId,
    plan: checkout.plan,
    status: confirmed ? "activated" : checkout.status,
    resumable: !confirmed && ["awaiting_payment", "failed"].includes(checkout.status),
    createdAt: checkout.createdAt,
  };
}

export function belongsToVoxora({ linkedSubscription, linkedCheckout, paddlePlan, checkoutPlan }) {
  // A valid Paddle signature alone is insufficient with a shared account:
  // BuildHire transactions and subscriptions must never provision Voxora.
  if (!linkedSubscription && !linkedCheckout) return false;
  if (!paddlePlan) return false;
  // A new checkout MUST have the exact server-authorized price, not an
  // arbitrary price or a modified custom_data field.
  if (!linkedSubscription && checkoutPlan !== paddlePlan) return false;
  return true;
}

export function publicPlanChange(change, subscription) {
  if (!change) return null;
  const confirmed = subscription?.paddleSubscriptionId === change.paddleSubscriptionId
    && subscription?.plan === change.toPlan
    && ["active","trialing"].includes(subscription?.status);
  return {
    plan: change.toPlan, fromPlan: change.fromPlan,
    status: confirmed ? "activated" : change.status,
    requestedAt: change.requestedAt,
    // Deliberately never send Paddle API error payloads to browsers.
    retryAllowed: !confirmed && change.status === "failed",
  };
}

export function isUncertainPaddleError(error) {
  return error?.name === "TimeoutError" || error?.name === "AbortError"
    || error instanceof TypeError
    || /Paddle request failed \(HTTP 5\d\d\)/.test(error?.message || "");
}
