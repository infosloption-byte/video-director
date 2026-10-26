import test from "node:test";
import assert from "node:assert/strict";
import {
  checkoutEventStatus, publicCheckoutStatus, belongsToVoxora,
  publicPlanChange, isUncertainPaddleError, PAYMENT_STATES,
} from "../src/services/paymentState.js";

test("checkout lifecycle uses signed Paddle outcomes only", () => {
  assert.deepEqual(PAYMENT_STATES, ["awaiting_payment","processing","activated","failed","canceled"]);
  assert.equal(checkoutEventStatus("checkout.closed"), "awaiting_payment");
  assert.equal(checkoutEventStatus("transaction.payment_failed"), "failed");
  assert.equal(checkoutEventStatus("transaction.completed", "failed"), "processing");
  assert.equal(checkoutEventStatus("transaction.canceled", "awaiting_payment"), "canceled");
  assert.equal(checkoutEventStatus("transaction.payment_failed", "activated"), "activated");
});

test("checkout confirmation binds the saved purchase to the matching paid subscription", () => {
  const checkout = { transactionId: "txn_01j12345678901234567890123", plan: "creator", paddleSubscriptionId: "sub_01abc", status: "processing" };
  const sub = { paddleSubscriptionId: "sub_01abc", plan: "creator", status: "active" };
  assert.equal(publicCheckoutStatus(checkout, sub).status, "activated");
  assert.equal(publicCheckoutStatus(checkout, { ...sub, paddleSubscriptionId: "sub_wrong" }).status, "processing");
  assert.equal(publicCheckoutStatus(checkout, { ...sub, plan: "studio" }).status, "processing");
  assert.equal(publicCheckoutStatus(checkout, { ...sub, status: "past_due" }).status, "processing");
  assert.equal(publicCheckoutStatus({ ...checkout, status: "failed" }, null).resumable, true);
  assert.equal(publicCheckoutStatus({ ...checkout, status: "canceled" }, null).resumable, false);
});

test("Voxora ignores validly signed BuildHire events without owned checkout or price", () => {
  const checkout = { userId: "voxora_user_123", plan: "studio" };
  const linked = { userId: "voxora_user_123", paddleSubscriptionId: "sub_01abc" };
  assert.equal(belongsToVoxora({ paddlePlan: "studio", checkoutPlan: "studio", linkedCheckout: checkout }), true);
  assert.equal(belongsToVoxora({ paddlePlan: "creator", linkedSubscription: linked }), true);
  assert.equal(belongsToVoxora({ paddlePlan: "studio" }), false); // BuildHire
  assert.equal(belongsToVoxora({ paddlePlan: null, linkedCheckout: checkout, checkoutPlan: "studio" }), false); // unrecognized price
  assert.equal(belongsToVoxora({ paddlePlan: "creator", linkedCheckout: checkout, checkoutPlan: "studio" }), false);
  assert.equal(belongsToVoxora({ paddlePlan: null, linkedSubscription: linked }), false);
});

test("plan changes persist pending, confirmed, failed and unknown outcomes", () => {
  const change = { fromPlan: "creator", toPlan: "studio", status: "processing", paddleSubscriptionId: "sub_01abc" };
  assert.equal(publicPlanChange(change, { paddleSubscriptionId: "sub_01abc", plan: "creator", status: "active" }).status, "processing");
  assert.equal(publicPlanChange(change, { paddleSubscriptionId: "sub_01abc", plan: "studio", status: "active" }).status, "activated");
  assert.equal(publicPlanChange({ ...change, status: "uncertain" }, null).status, "uncertain");
  assert.equal(publicPlanChange({ ...change, status: "failed" }, null).retryAllowed, true);
  assert.equal(publicPlanChange({ ...change, status: "processing" }, null).retryAllowed, false);
});

test("only truly uncertain Paddle errors block a potential second charge", () => {
  assert.equal(isUncertainPaddleError(Object.assign(new Error("delayed"), { name: "TimeoutError" })), true);
  assert.equal(isUncertainPaddleError(new TypeError("connection reset")), true);
  assert.equal(isUncertainPaddleError(new Error("Paddle request failed (HTTP 500).")), true);
  assert.equal(isUncertainPaddleError(new Error("Paddle request failed (HTTP 422).")), false);
});
