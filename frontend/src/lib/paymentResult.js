// A browser redirect is only a hint, never proof of a successful payment.
export const PAYMENT_REDIRECT_SECONDS = 15;
export const PADDLE_TRANSACTION_PATTERN = /^txn_[a-z0-9]{20,100}$/;
export const PAID_PLANS = Object.freeze(["creator", "studio"]);

export function paymentResultPath({ type, transactionId, plan, onboarding = false, issue = false }) {
  const query = new URLSearchParams();
  if (type === "checkout" && PADDLE_TRANSACTION_PATTERN.test(transactionId || "")) {
    query.set("type", "checkout");
    query.set("transactionId", transactionId);
  } else if (type === "change" && PAID_PLANS.includes(plan)) {
    query.set("type", "change");
    query.set("plan", plan);
  } else {
    return "/choose-plan";
  }
  if (onboarding) query.set("onboarding", "1");
  if (issue) query.set("issue", "1");
  return `/payment-result?${query}`;
}

export function resolvePaymentOutcome({ type, transactionId, plan, payment, billing, issue = false }) {
  const entry = type === "checkout" ? payment?.checkout : payment?.change;
  const isMatching = type === "checkout"
    ? PADDLE_TRANSACTION_PATTERN.test(transactionId || "") && entry?.transactionId === transactionId
    : type === "change" && PAID_PLANS.includes(plan) && entry?.plan === plan;
  if (!isMatching) return { phase: issue ? "issue" : "unknown", plan: null };
  const selectedPlan = type === "checkout" ? entry.plan : entry.plan;
  const actualPlan = billing?.plan?.id;
  const active = ["active","trialing"].includes(billing?.subscription?.status);
  if (entry.status === "activated" && active && actualPlan === selectedPlan) {
    return { phase: "success", plan: selectedPlan };
  }
  if (["failed","canceled"].includes(entry.status)) {
    return { phase: entry.status, plan: selectedPlan };
  }
  if (entry.status === "awaiting_payment" && issue) return { phase: "issue", plan: selectedPlan };
  if (["awaiting_payment","processing","uncertain","activated"].includes(entry.status)) {
    return { phase: "processing", plan: selectedPlan };
  }
  return { phase: "unknown", plan: selectedPlan };
}
