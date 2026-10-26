import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import SessionGate from "../components/SessionGate";
import {
  PAID_PLANS, PADDLE_TRANSACTION_PATTERN, PAYMENT_REDIRECT_SECONDS,
  resolvePaymentOutcome,
} from "../lib/paymentResult";
import "./PaymentResultPage.css";

const CHECK_INTERVAL_MS = 3000;
const WORKSPACE = "/signals";

async function readApi(path) {
  const response = await fetch(path, { credentials: "include", cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not check your payment.");
  return payload;
}

function dateLabel(value) {
  if (!value) return "Provided in your Paddle account";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Provided in your Paddle account";
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function PaymentResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { status, user, refresh } = useAuth();
  const query = new URLSearchParams(location.search);
  const type = query.get("type");
  const transactionId = query.get("transactionId");
  const requestedPlan = query.get("plan");
  const issue = query.get("issue") === "1";
  const onboarding = query.get("onboarding") === "1";
  const valid = type === "checkout"
    ? PADDLE_TRANSACTION_PATTERN.test(transactionId || "")
    : type === "change" && PAID_PLANS.includes(requestedPlan);
  const backPath = `/choose-plan?${new URLSearchParams({
    ...(onboarding ? {} : { mode: "upgrade" }),
    ...((type === "change" && PAID_PLANS.includes(requestedPlan)) ? { plan: requestedPlan } : {}),
  })}`;
  const [result, setResult] = useState(null);
  const [apiError, setApiError] = useState("");
  const [retry, setRetry] = useState(0);
  const [seconds, setSeconds] = useState(PAYMENT_REDIRECT_SECONDS);
  const redirecting = useRef(false);
  const lastPhase = useRef("loading");

  useEffect(() => {
    if (status !== "ready" || !user?.emailVerifiedAt || !valid) return undefined;
    let active = true;
    let inFlight = false;
    let pollingTimer;
    const update = async () => {
      if (inFlight || !active) return;
      inFlight = true;
      try {
        const [payment, billing, catalog] = await Promise.all([
          readApi("/api/billing/payment-state"),
          readApi("/api/billing/me"),
          readApi("/api/billing/plans"),
        ]);
        if (!active) return;
        const outcome = resolvePaymentOutcome({
          type, transactionId, plan: requestedPlan, payment, billing, issue,
        });
        if (lastPhase.current !== outcome.phase) {
          lastPhase.current = outcome.phase;
          setSeconds(PAYMENT_REDIRECT_SECONDS);
        }
        setResult({ ...outcome, billing, catalog });
        setApiError("");
        // SDK errors are not payment proof. Keep listening for a later signed
        // activation even while offering an early return to the plan page.
        if (["success", "failed", "canceled"].includes(outcome.phase))
          window.clearInterval(pollingTimer);
      } catch (error) {
        if (active) setApiError(error.message || "Unable to confirm payment status.");
      } finally { inFlight = false; }
    };
    void update();
    pollingTimer = window.setInterval(() => { void update(); }, CHECK_INTERVAL_MS);
    return () => { active = false; window.clearInterval(pollingTimer); };
  }, [status, user?.id, user?.emailVerifiedAt, valid, type, transactionId, requestedPlan, issue, retry]);

  const phase = result?.phase || "loading";
  const isSuccess = phase === "success";
  const isFailure = ["failed", "canceled", "issue"].includes(phase);
  const isTerminal = isSuccess || isFailure;
  const confirmedPlan = result?.catalog?.plans?.find(p => p.id === result.plan);
  const billing = result?.billing;
  const planName = confirmedPlan?.name || (result?.plan === "studio" ? "Studio" : result?.plan === "creator" ? "Creator" : "Paid");
  const nextDestination = isSuccess ? WORKSPACE : backPath;

  const continueNow = useCallback(async () => {
    if (redirecting.current) return;
    redirecting.current = true;
    try {
      if (isSuccess) await refresh();
      navigate(nextDestination, { replace: true });
    } catch {
      redirecting.current = false;
    }
  }, [isSuccess, refresh, navigate, nextDestination]);

  useEffect(() => {
    if (!isTerminal) return undefined;
    const timer = window.setInterval(() => setSeconds(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [isTerminal]);

  useEffect(() => {
    if (isTerminal && seconds === 0) void continueNow();
  }, [isTerminal, seconds, continueNow]);

  if (status === "loading") return <SessionGate label="Checking your payment session…" />;
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (!user.emailVerifiedAt) return <Navigate to="/verify-email" replace />;

  const resultTitle = isSuccess
    ? type === "change" ? "Your plan is updated." : "Payment successful!"
    : phase === "failed" ? "Your payment wasn't successful."
    : phase === "canceled" ? "Payment canceled."
    : phase === "issue" ? "Checkout could not finish."
    : phase === "unknown" ? "Payment status needs verification." : "Checking your payment…";
  const resultText = isSuccess
    ? `Your ${planName} subscription is confirmed and active. You're ready to create with Voxora.`
    : phase === "failed" ? "Paddle could not complete this payment. No new plan has been activated. Review your payment details and resume checkout or review a fresh upgrade quote."
    : phase === "canceled" ? "Your checkout was canceled. You can return to the plan selection page to choose how to continue."
    : phase === "issue" ? "The checkout encountered an issue, and we haven't confirmed a successful payment. Return to your plan page to resume the saved transaction. Don't start another charge while a payment is processing."
    : phase === "unknown" ? "We couldn't match this link to a saved Voxora transaction yet. Check again or return to your plan page. Never start another charge while a payment outcome is uncertain."
    : "Paddle may have received your payment. Voxora is checking the signed subscription confirmation before updating your plan. Please do not submit another payment.";

  return <div className="payment-result">
    <header className="payment-result__bar">
      <Link to="/" className="payment-result__brand" aria-label="Voxora home"><span>V</span> Voxora</Link>
      <span className="payment-result__secure">Secured by Paddle</span>
    </header>
    <main className="payment-result__main">
      <section className="payment-result__card" aria-labelledby="payment-result-title">
        <div className={`payment-result__symbol payment-result__symbol--${isSuccess ? "success" : isFailure ? "failed" : "pending"}`} aria-hidden="true">
          {isSuccess ? "✓" : isFailure ? "!" : "···"}
        </div>
        <p className="eyebrow">{isSuccess ? "PAYMENT CONFIRMED" : isFailure ? "PAYMENT NEEDS ATTENTION" : "SECURE PAYMENT VERIFICATION"}</p>
        <h1 id="payment-result-title">{valid ? resultTitle : "Payment link is incomplete."}</h1>
        <p className="payment-result__lead">{valid ? resultText : "We couldn't identify this payment. Your plan details remain available from Voxora Billing."}</p>

        {apiError && <div className="payment-result__alert" role="alert">
          We couldn't refresh your payment status. This does not mean a payment failed. {apiError}
        </div>}

        {isSuccess && <div className="payment-result__summary" aria-label="Confirmed subscription summary">
          <div className="payment-result__summary-head">
            <span>YOUR SUBSCRIPTION</span><strong>Active</strong>
          </div>
          <div><span>Plan</span><strong>{planName}</strong></div>
          <div><span>Standard monthly price</span><strong>{confirmedPlan ? `$${confirmedPlan.monthlyUsd.toFixed(2)} / month` : "See Billing"}</strong></div>
          <div><span>Monthly video renders</span><strong>{billing?.plan?.rendersPerMonth ?? "—"}</strong></div>
          <div><span>Maximum video duration</span><strong>{billing?.plan?.maxSeconds ?? "—"} seconds</strong></div>
          <div><span>Next billing period ends</span><strong>{dateLabel(billing?.subscription?.periodEnd)}</strong></div>
          {type === "checkout" && <div><span>Paddle transaction</span><strong className="payment-result__transaction">{transactionId}</strong></div>}
          <p>Actual amounts charged, proration and applicable taxes are shown in your Paddle receipt or billing history.</p>
        </div>}

        {isFailure && <div className="payment-result__summary payment-result__summary--failure" role="status">
          <div><span>Requested plan</span><strong>{planName}</strong></div>
          <div><span>Payment status</span><strong>{phase === "failed" ? "Failed" : phase === "canceled" ? "Canceled" : "Not confirmed"}</strong></div>
          {type === "change" && <p>Your previous plan remains available unless Paddle has already confirmed a different subscription status. Review it in Billing.</p>}
          {type === "checkout" && <p>If Paddle already received a payment, do not submit a second transaction. The plan selector will recover the original checkout.</p>}
        </div>}

        {isTerminal && valid && <div className="payment-result__countdown" role="status" aria-live="off">
          <div className="payment-result__timer" aria-hidden="true">{seconds}</div>
          <div><strong>Redirecting to {isSuccess ? "your workspace" : "plan selection"} in {seconds} seconds</strong>
            <p>You can continue now using the button below.</p>
          </div>
        </div>}

        <div className="payment-result__actions">
          {!valid ? <Link className="btn btn-cream" to="/choose-plan">Back to plans →</Link>
            : isTerminal
              ? <button className="btn btn-cream" type="button" onClick={() => void continueNow()}>
                  {isSuccess ? "Go to workspace →" : "Back to plans and retry →"}
                </button>
              : <button type="button" className="btn btn-cream" onClick={() => setRetry(n => n + 1)}>
                  Check payment status
                </button>}
          <Link className="btn btn-ghost" to={isSuccess ? "/billing" : backPath}>
            {isSuccess ? "View subscription & billing" : "View plan options"}
          </Link>
        </div>
        {!isTerminal && valid && <p className="payment-result__help" role="status">
          Your plan will activate only after the signed Paddle webhook is verified. If confirmation is delayed, you can safely return here to check again.
        </p>}
      </section>
    </main>
  </div>;
}
