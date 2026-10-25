// Pure helpers shared by plan previews, plan updates and webhook mapping.
// Server-owned Paddle price IDs are the only selectable products.
export const ACTIVE_BILLING_STATUSES = Object.freeze(["active", "trialing"]);

export function isPaidSubscriptionActive(subscription) {
  return Boolean(subscription && ACTIVE_BILLING_STATUSES.includes(subscription.status));
}

export function planFromSubscriptionItems(items, priceLookup) {
  const ids = (Array.isArray(items) ? items : []).map((item) => item?.price?.id || item?.price_id);
  return Object.entries(priceLookup).find(([, id]) => id && ids.includes(id))?.[0] || null;
}

export function planChangeMode(fromPlan, toPlan) {
  const order = { creator: 1, studio: 2 };
  if (!(fromPlan in order) || !(toPlan in order) || fromPlan === toPlan) return null;
  return order[toPlan] > order[fromPlan] ? "prorated_immediately" : "prorated_next_billing_period";
}

export function planChangeRequest(fromPlan, toPlan, targetPriceId) {
  const mode = planChangeMode(fromPlan, toPlan);
  if (!mode || !/^pri_/.test(targetPriceId || "")) return null;
  return {
    items: [{ price_id: targetPriceId, quantity: 1 }],
    proration_billing_mode: mode,
    on_payment_failure: "prevent_change",
  };
}

export function successfulCheckout(checkout, subscription) {
  return Boolean(checkout?.paddleSubscriptionId
    && subscription?.paddleSubscriptionId === checkout.paddleSubscriptionId
    && subscription?.plan === checkout.plan
    && isPaidSubscriptionActive(subscription));
}

export function voxoraCheckoutUrl(publicBaseUrl, checkoutOverride, environment = "sandbox") {
  const base = new URL(publicBaseUrl || "https://usevoxora.online");
  const link = new URL(checkoutOverride || "/checkout", base);
  // URLs are chosen by the service operator, never from customer input.
  // Do not permit a payment link redirect to an unrelated checkout domain.
  const sandboxLocalhost = environment === "sandbox"
    && ["localhost", "127.0.0.1"].includes(base.hostname);
  if (link.origin !== base.origin || link.pathname !== "/checkout"
      || link.search || link.hash || link.username || link.password
      || (link.protocol !== "https:" && !(sandboxLocalhost && link.protocol === "http:"))) {
    throw new Error("Paddle checkout URL must be the Voxora /checkout page on the configured public origin.");
  }
  return link.href;
}
