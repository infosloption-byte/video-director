import test from "node:test";
import assert from "node:assert/strict";
import {
  isPaidSubscriptionActive,
  planFromSubscriptionItems,
  planChangeMode,
  planChangeRequest,
  successfulCheckout,
  voxoraCheckoutUrl,
} from "../src/services/paddlePlanFlow.js";

const prices = { creator: "pri_creator01", studio: "pri_studio01" };

test("only verified subscription states grant paid entitlement", () => {
  assert.equal(isPaidSubscriptionActive({ status: "active" }), true);
  assert.equal(isPaidSubscriptionActive({ status: "trialing" }), true);
  for (const status of ["past_due", "paused", "canceled", "inactive", null]) {
    assert.equal(isPaidSubscriptionActive({ status }), false);
  }
  assert.equal(isPaidSubscriptionActive(null), false);
});

test("recognize only server-configured Paddle prices in subscription events", () => {
  assert.equal(planFromSubscriptionItems([{ price: { id: "pri_creator01" } }], prices), "creator");
  assert.equal(planFromSubscriptionItems([{ price_id: "pri_studio01" }], prices), "studio");
  assert.equal(planFromSubscriptionItems([{ price: { id: "pri_untrusted" } }], prices), null);
});

test("upgrades bill prorated immediately and downgrades on the next billing period", () => {
  assert.equal(planChangeMode("creator", "studio"), "prorated_immediately");
  assert.equal(planChangeMode("studio", "creator"), "prorated_next_billing_period");
  assert.equal(planChangeMode("creator", "creator"), null);
  assert.equal(planChangeMode("free", "studio"), null);
  assert.deepEqual(planChangeRequest("creator", "studio", prices.studio), {
    items: [{ price_id: prices.studio, quantity: 1 }],
    proration_billing_mode: "prorated_immediately",
    on_payment_failure: "prevent_change",
  });
  assert.equal(planChangeRequest("creator", "studio", "wrong"), null);
});

test("checkout confirmation requires the checkout-linked subscription and its paid status", () => {
  const checkout = { paddleSubscriptionId: "sub_linked", plan: "creator" };
  const live = { paddleSubscriptionId: "sub_linked", plan: "creator", status: "active" };
  assert.equal(successfulCheckout(checkout, live), true);
  assert.equal(successfulCheckout({ ...checkout, paddleSubscriptionId: null }, live), false);
  assert.equal(successfulCheckout(checkout, { ...live, paddleSubscriptionId: "sub_another" }), false);
  assert.equal(successfulCheckout(checkout, { ...live, plan: "studio" }), false);
  assert.equal(successfulCheckout(checkout, { ...live, status: "past_due" }), false);
  assert.equal(successfulCheckout(checkout, null), false);
});

test("Voxora transactions use their own checkout URL, without changing Paddle's account default", () => {
  assert.equal(voxoraCheckoutUrl("https://usevoxora.online", undefined), "https://usevoxora.online/checkout");
  assert.equal(voxoraCheckoutUrl("https://usevoxora.online/", "/checkout", "sandbox"), "https://usevoxora.online/checkout");
  assert.equal(voxoraCheckoutUrl("https://usevoxora.online", "https://usevoxora.online/checkout"), "https://usevoxora.online/checkout");
  assert.throws(() => voxoraCheckoutUrl("https://usevoxora.online", "https://buildhire.sloptions.xyz/checkout"), /configured public origin/);
  assert.throws(() => voxoraCheckoutUrl("https://usevoxora.online", "https://attacker.example/checkout"), /configured public origin/);
  assert.throws(() => voxoraCheckoutUrl("https://usevoxora.online", "https://usevoxora.online/checkout?redirect=evil"), /configured public origin/);
  assert.equal(voxoraCheckoutUrl("http://localhost:5173", "/checkout", "sandbox"), "http://localhost:5173/checkout");
  assert.throws(() => voxoraCheckoutUrl("http://localhost:5173", "/checkout", "live"), /configured public origin/);
});
