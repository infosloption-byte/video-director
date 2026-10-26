import test from "node:test";
import assert from "node:assert/strict";
import { paymentResultPath, resolvePaymentOutcome, PAYMENT_REDIRECT_SECONDS } from "../src/lib/paymentResult.js";

const txn = "txn_01j12345678901234567890123";
const billing = (plan) => ({
  plan: { id: plan },
  subscription: { status: "active", paddleSubscriptionId: "sub_01abc" },
});

test("the result URL preserves the transaction reference and onboarding context", () => {
  assert.equal(paymentResultPath({ type:"checkout", transactionId: txn, onboarding:true }), `/payment-result?type=checkout&transactionId=${txn}&onboarding=1`);
  assert.equal(paymentResultPath({ type:"change", plan:"studio" }), "/payment-result?type=change&plan=studio");
  assert.equal(paymentResultPath({ type:"checkout", transactionId:"invalid" }), "/choose-plan");
  assert.equal(paymentResultPath({ type:"change", plan:"enterprise" }), "/choose-plan");
  assert.equal(PAYMENT_REDIRECT_SECONDS, 15);
});

test("only the matching server-confirmed active subscription grants success", () => {
  const entry = { transactionId:txn, plan:"creator", status:"activated" };
  const payment = { checkout:entry };
  assert.equal(resolvePaymentOutcome({ type:"checkout",transactionId:txn,payment,billing:billing("creator") }).phase,"success");
  assert.equal(resolvePaymentOutcome({ type:"checkout",transactionId:txn,payment,billing:billing("studio") }).phase,"processing");
  assert.equal(resolvePaymentOutcome({ type:"checkout",transactionId:txn+"wrong",payment,billing:billing("creator") }).phase,"unknown");
  assert.equal(resolvePaymentOutcome({ type:"checkout",transactionId:txn,payment,billing:{plan:{id:"creator"},subscription:{status:"past_due"}} }).phase,"processing");
  assert.equal(resolvePaymentOutcome({ type:"checkout",transactionId:txn,payment:{checkout:{...entry,status:"processing"}},billing:billing("creator") }).phase,"processing");
});

test("declined and canceled Paddle outcomes cannot be shown as success", () => {
  for (const status of ["failed","canceled"]) {
    const outcome = resolvePaymentOutcome({
      type:"checkout",transactionId:txn,
      payment:{checkout:{transactionId:txn,plan:"creator",status}},billing:billing("creator"),
    });
    assert.equal(outcome.phase,status);
  }
  const issue = resolvePaymentOutcome({
    type:"checkout",transactionId:txn,issue:true,
    payment:{checkout:{transactionId:txn,plan:"creator",status:"awaiting_payment"}},
    billing:billing("creator"),
  });
  assert.equal(issue.phase,"issue");
});

test("upgrade success requires the server-confirmed target plan; declines retain failure", () => {
  assert.equal(resolvePaymentOutcome({
    type:"change",plan:"studio",payment:{change:{plan:"studio",status:"activated"}},
    billing:billing("studio"),
  }).phase,"success");
  assert.equal(resolvePaymentOutcome({
    type:"change",plan:"studio",payment:{change:{plan:"studio",status:"processing"}},
    billing:billing("creator"),
  }).phase,"processing");
  assert.equal(resolvePaymentOutcome({
    type:"change",plan:"studio",payment:{change:{plan:"studio",status:"failed"}},
    billing:billing("creator"),
  }).phase,"failed");
});
