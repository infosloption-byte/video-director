import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { openPaddleCheckout } from "../lib/paddle";
import { paymentResultPath } from "../lib/paymentResult";
import { verificationPath } from "../lib/onboarding";
import "./PlanSelectPage.css";

const WORKSPACE = "/signals";
const WAIT_INTERVAL_MS = 2500;
const MAX_CHECKS = 50;

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include", cache: "no-store", ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Unable to complete your request.");
  return data;
}

function money(minor, currency = "USD") {
  const value = Number(minor);
  if (!Number.isFinite(value)) return "—";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value / 100); }
  catch { return `${(value / 100).toFixed(2)} ${currency}`; }
}

export default function PlanSelectPage() {
  const { user, status, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [catalog, setCatalog] = useState(null);
  const [billing, setBilling] = useState(null);
  const [paymentState, setPaymentState] = useState(null);
  const [checkoutClosed, setCheckoutClosed] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(null);
  const [pending, setPending] = useState(() => {
    const id = params.get("transactionId");
    return id && /^txn_[a-z0-9]{20,100}$/.test(id) ? { type: "checkout", id } : null;
  });
  const [verificationDelayed, setVerificationDelayed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const completedTransaction = useRef("");
  const selectedPlan = params.get("plan") || (!user?.planSelectedAt ? user?.intendedPlan : null);
  const isReturningCustomer = Boolean(user?.planSelectedAt || ["active", "trialing"].includes(billing?.subscription?.status)) && params.get("onboarding") !== "1";


  useEffect(() => {
    if (status !== "ready" || !user?.emailVerifiedAt) return undefined;
    let active = true;
    Promise.all([api("/api/billing/plans"), api("/api/billing/me"), api("/api/billing/payment-state")])
      .then(([plans, account, payment]) => {
        if (!active) return;
        setCatalog(plans);
        setBilling(account);
        setPaymentState(payment);
        const checkout = payment.checkout;
        const change = payment.change;
        if (checkout?.status === "processing") {
          navigate(paymentResultPath({ type: "checkout", transactionId: checkout.transactionId, onboarding: !user?.planSelectedAt }), { replace: true });
        } else if (change && ["processing", "uncertain"].includes(change.status)) {
          navigate(paymentResultPath({ type: "change", plan: change.plan }), { replace: true });
        }
      })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [status, user?.id, user?.emailVerifiedAt, user?.planSelectedAt, navigate]);


  // Legacy /choose-plan?transactionId=... links now land on the single
  // result screen instead of fast-forwarding to Billing or the workspace.
  useEffect(() => {
    if (!pending || !user?.id) return;
    navigate(pending.type === "checkout"
      ? paymentResultPath({ type: "checkout", transactionId: pending.id, onboarding: !user?.planSelectedAt })
      : paymentResultPath({ type: "change", plan: pending.plan }), { replace: true });
  }, [pending, user?.id, user?.planSelectedAt, navigate]);

  useEffect(() => {
    if (!preview && !cancelConfirm) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busy) { setPreview(null); setCancelConfirm(false); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [preview, cancelConfirm, busy]);

  if (status === "loading") return null;
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent("/choose-plan" + window.location.search)}`} replace />;
  if (!user.emailVerifiedAt) return <Navigate to={verificationPath("/choose-plan" + window.location.search)} replace />;

  async function chooseFree() {
    setBusy("free"); setError("");
    try {
      if (isReturningCustomer) {
        navigate(WORKSPACE, { replace: true });
        return;
      }
      await api("/api/billing/plan-selected", { method: "POST", body: JSON.stringify({ plan: "free" }) });
      await refresh();
      navigate(WORKSPACE, { replace: true });
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  async function newPaidCheckout(plan) {
    setBusy(plan); setError(""); setMessage(""); setPreview(null);
    try {
      const data = await api("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan }) });
      completedTransaction.current = "";
      setCheckoutClosed(false);
      setPaymentState(old => ({
        ...(old || {}),
        checkout: {
          transactionId: data.transactionId,
          plan: data.plan || plan,
          status: data.status || "awaiting_payment",
          resumable: true,
        },
      }));
      await openPaddleCheckout({
        transactionId: data.transactionId,
        clientToken: data.clientToken,
        environment: data.environment,
        customerEmail: user.email,
        successUrl: `${window.location.origin}${paymentResultPath({ type: "checkout", transactionId: data.transactionId, onboarding: !isReturningCustomer })}`,
        onCompleted: () => {
          completedTransaction.current = data.transactionId;
          window.Paddle?.Checkout?.close?.();
          navigate(paymentResultPath({
            type: "checkout", transactionId: data.transactionId, onboarding: !isReturningCustomer,
          }), { replace: true });
        },
        onClosed: () => {
          if (completedTransaction.current !== data.transactionId) {
            setCheckoutClosed(true);
            setMessage("Checkout closed. Your original Paddle transaction is saved—resume it whenever you're ready.");
          }
        },
        onError: () => navigate(paymentResultPath({
          type: "checkout", transactionId: data.transactionId, onboarding: !isReturningCustomer, issue: true,
        }), { replace: true }),
      });
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  async function checkPaymentStatus() {
    setBusy("status"); setError("");
    try {
      const state = await api("/api/billing/payment-state");
      setPaymentState(state);
      if (state.checkout?.status === "activated" || state.checkout?.status === "processing") {
        navigate(paymentResultPath({ type: "checkout", transactionId: state.checkout.transactionId, onboarding: !user?.planSelectedAt }), { replace: true });
        return;
      }
      if (state.change && ["activated","processing","uncertain"].includes(state.change.status)) {
        navigate(paymentResultPath({ type: "change", plan: state.change.plan }), { replace: true });
        return;
      } else {
        setMessage("Your payment status is up to date.");
      }
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  async function cancelUnpaidCheckout() {
    if (!activeCheckout?.transactionId) return;
    setBusy("cancel"); setError("");
    try {
      await api("/api/billing/checkout/cancel", {
        method: "POST",
        body: JSON.stringify({ transactionId: activeCheckout.transactionId }),
      });
      setPaymentState(old => ({ ...old, checkout: { ...activeCheckout, status: "canceled", resumable: false } }));
      setPending(null);
      setCancelConfirm(false);
      setMessage("The unpaid transaction was canceled at Paddle. You can choose a different plan.");
    } catch (e) { setError(e.message); setCancelConfirm(false); }
    finally { setBusy(""); }
  }

  async function previewChange(plan) {
    setBusy(plan); setError(""); setPreview(null);
    try {
      const data = await api("/api/billing/change-preview", { method: "POST", body: JSON.stringify({ plan }) });
      setPreview(data);
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  async function confirmChange() {
    if (!preview) return;
    const plan = preview.toPlan;
    setBusy(plan); setError("");
    try {
      await api("/api/billing/change-plan", { method: "POST", body: JSON.stringify({ plan }) });
      setPreview(null);
      setVerificationDelayed(false);
      navigate(paymentResultPath({ type: "change", plan }), { replace: true });
    } catch {
      navigate(paymentResultPath({ type: "change", plan, issue: true }), { replace: true });
    }
    finally { setBusy(""); }
  }

  function choosePlan(plan) {
    if (plan === "free") return void chooseFree();
    if (billing?.subscription && ["active", "trialing"].includes(billing.subscription.status)) return void previewChange(plan);
    return void newPaidCheckout(plan);
  }

  const activeCheckout = paymentState?.checkout;
  const activeChange = paymentState?.change;
  const checkoutNeedsAttention = activeCheckout && ["awaiting_payment", "failed"].includes(activeCheckout.status);
  const changeNeedsAttention = activeChange && activeChange.status === "failed";
  const paymentBlocked = Boolean(paymentState?.creating || (activeCheckout && ["awaiting_payment", "processing", "failed"].includes(activeCheckout.status))
    || (activeChange && ["processing", "uncertain"].includes(activeChange.status)));
  const currentPlan = billing?.plan?.id || "free";
  const subscription = billing?.subscription;
  const activeSubscription = ["active", "trialing"].includes(subscription?.status);
  const blockedSubscription = subscription && !activeSubscription && subscription.status !== "canceled";
  const plans = catalog?.plans || [];

  return <div className="plan-select">
    <header className="plan-select__bar">
      <nav className="plan-select__bar-inner" aria-label="Plan selection navigation">
        <Link to={isReturningCustomer ? WORKSPACE : "/"} className="plan-select__logo"><span>V</span>Voxora</Link>
        {isReturningCustomer
          ? <Link className="plan-select__back" to="/billing" aria-label="Back to subscription and billing">
              <span aria-hidden="true" className="plan-select__back-arrow">←</span>
              <span>Back to Billing</span>
            </Link>
          : <button type="button" className="plan-select__signout" onClick={() => { navigate("/", { replace: true }); void signOut(); }}>Sign out</button>}
      </nav>
    </header>
    <main className="plan-select__main">
      {!isReturningCustomer && <ol className="plan-select__steps" aria-label="Account setup progress">
        <li className="is-done"><span>✓</span>Account created</li>
        <li className="is-done"><span>✓</span>Email verified</li>
        <li className="is-current"><span>3</span>Choose a plan</li>
      </ol>}
      <p className="eyebrow">{isReturningCustomer ? "Subscription & upgrades" : "Almost there"}</p>
      <h1>{isReturningCustomer ? "Choose your next plan." : "Choose how you want to start."}</h1>
      <p className="plan-select__lead">{isReturningCustomer
        ? `You're currently on ${billing?.plan?.name || "your current"} plan. Compare the available options and select your next plan.`
        : "Start with Free or choose a paid plan. Paddle securely collects payment; Voxora activates the paid plan after confirmation."}</p>

      {paymentState?.checkout?.status === "activated" && <div role="status" className="plan-select__notice">
        Payment activated. Your paid subscription is confirmed. <Link to="/billing">View Billing</Link>.
      </div>}
      {paymentState?.checkout?.status === "canceled" && <div role="status" className="plan-select__notice">
        Your previous unpaid checkout was canceled. You may select a different plan.
      </div>}
            {error && <div role="alert" className="plan-select__alert">{error}</div>}
      {message && <div role="status" className="plan-select__notice">{message}</div>}

      {paymentState?.creating && <div className="plan-select__notice" role="status">
        A previous checkout request is awaiting reconciliation. Please do not start another payment. Contact billing support if this remains unresolved.
      </div>}
      {checkoutNeedsAttention && !pending && <section className="plan-select__recovery" aria-live="polite">
        <div>
          <p className="eyebrow">{activeCheckout.status === "failed" ? "PAYMENT NOT COMPLETED" : checkoutClosed ? "CHECKOUT CLOSED" : "PAYMENT AWAITING"}</p>
          <h2>{activeCheckout.plan === "studio" ? "Studio" : "Creator"} checkout is still available</h2>
          <p>{activeCheckout.status === "failed"
            ? "Paddle reported an unsuccessful payment attempt. You can reopen the same transaction to update payment details without creating another charge."
            : "Your checkout has not been confirmed. Resume the existing transaction instead of creating a second one."}</p>
        </div>
        <div className="plan-select__recovery-actions">
          <button type="button" className="btn btn-cream" disabled={Boolean(busy)} onClick={() => newPaidCheckout(activeCheckout.plan)}>
            {busy ? "Opening…" : "Resume checkout →"}
          </button>
          <button type="button" className="btn btn-ghost" disabled={Boolean(busy)} onClick={checkPaymentStatus}>
            Check payment status
          </button>
          <button type="button" className="plan-select__text-action" disabled={Boolean(busy)} onClick={() => setCancelConfirm(true)}>
            Cancel unpaid checkout
          </button>
        </div>
      </section>}
      {changeNeedsAttention && !pending && <section className="plan-select__recovery" aria-live="polite">
        <div><p className="eyebrow">PLAN CHANGE FAILED</p>
          <h2>Your current plan is unchanged</h2>
          <p>The prorated payment was not completed. Review a fresh Paddle quote before trying again.</p>
        </div>
        <button type="button" className="btn btn-cream" disabled={Boolean(busy)} onClick={() => previewChange(activeChange.plan)}>
          Review and retry →
        </button>
      </section>}
      {pending && <section className="plan-select__verification" aria-live="polite">
        <span className="plan-select__loading-dot" aria-hidden="true" />
        <div><h2>{verificationDelayed ? "Confirmation is taking longer than expected" : pending.type === "change" ? "Processing your plan change…" : "Confirming your payment…"}</h2>
          <p>{verificationDelayed
            ? "Don't pay a second time. Paddle may still be delivering the subscription event. You can check again or contact billing support."
            : "Paddle verifies the payment and Voxora waits for the signed subscription update. This page will advance automatically when confirmed."}</p>
        </div>
        {verificationDelayed && <button type="button" className="btn btn-ghost" onClick={() => { setVerificationDelayed(false); setRetryCount((x) => x + 1); setMessage("Checking again…"); }}>Check again</button>}
      </section>}

      <div className="plan-select__grid">
        {!catalog && !error && <div className="plan-select__loading">Loading plans…</div>}
        {plans.map((plan) => {
          const free = plan.id === "free";
          const same = plan.id === currentPlan;
          const selected = plan.id === selectedPlan;
          const changing = activeSubscription && !same && !free;
          const isDisabled = Boolean(busy || pending || (activeSubscription && free) || blockedSubscription ||
            (!free && !catalog?.billingReady) || (subscription?.cancelAtPeriodEnd && changing));
          const cta = same && isReturningCustomer ? "Current plan" : free ? "Continue with Free" :
            !catalog?.billingReady ? "Checkout unavailable" : changing ? "Review plan change →" : `Pay for ${plan.name} →`;
          return <article key={plan.id} className={`plan-select__card${free ? "" : " is-paid"}${same && isReturningCustomer ? " is-current" : ""}${selected ? " is-highlighted" : ""}`}>
            <header>
              <span className="plan-select__tag">{same && isReturningCustomer ? "Current plan" : free ? "Free" : "Monthly"}</span>
              <h2>{plan.name}</h2>
              <div className="plan-select__price">{free ? "$0" : `$${plan.monthlyUsd}`}<small>{free ? "forever" : "/ month"}</small></div>
            </header>
            <ul>
              <li>{plan.rendersPerMonth} video renders per month</li>
              <li>Up to {plan.maxSeconds} seconds per video</li>
              <li>{free ? "Start without payment details" : "Research, storyboard, editing and exports"}</li>
            </ul>
            <button type="button" className={free ? "btn btn-ghost" : "btn btn-cream"}
              disabled={isDisabled || paymentBlocked || (same && isReturningCustomer)}
              onClick={() => choosePlan(plan.id)}>
              {busy === plan.id ? "Working…" : cta}
            </button>
          </article>;
        })}
      </div>

      {blockedSubscription && <p className="plan-select__foot">Your existing subscription needs attention before selecting another. <Link to="/billing">Manage payment details in Billing</Link>.</p>}
      {subscription?.cancelAtPeriodEnd && <p className="plan-select__foot">Your subscription has a scheduled cancellation. Manage that in <Link to="/billing">Billing</Link> before changing plans.</p>}

      {cancelConfirm && <div className="plan-select__dialog-backdrop">
        <section role="dialog" aria-modal="true" aria-labelledby="cancel-checkout-title" className="plan-select__dialog">
          <span className="eyebrow">STOP UNPAID CHECKOUT</span>
          <h2 id="cancel-checkout-title">Cancel this unpaid transaction?</h2>
          <p>We will ask Paddle to cancel the saved transaction. If Paddle has already begun processing payment, we will keep it pending instead. This never cancels an active subscription.</p>
          <div className="plan-select__dialog-actions">
            <button type="button" className="btn btn-ghost" autoFocus disabled={Boolean(busy)} onClick={() => setCancelConfirm(false)}>Keep checkout</button>
            <button type="button" className="btn btn-cream" disabled={Boolean(busy)} onClick={cancelUnpaidCheckout}>{busy ? "Confirming…" : "Cancel unpaid transaction"}</button>
          </div>
        </section>
      </div>}
      {preview && <div className="plan-select__dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setPreview(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="plan-change-title" className="plan-select__dialog">
          <span className="eyebrow">Review with Paddle</span>
          <h2 id="plan-change-title">Change from {catalog?.plans.find(p=>p.id===preview.fromPlan)?.name} to {catalog?.plans.find(p=>p.id===preview.toPlan)?.name}?</h2>
          <p>{preview.mode === "prorated_immediately"
            ? "Paddle calculates a prorated charge or credit for the remaining billing period and may collect payment immediately. If payment fails, your current plan remains unchanged."
            : "Paddle calculates a prorated adjustment for the next billing period. Your requested plan change is processed now, with the adjustment included in a future charge."}</p>
          <div className="plan-select__preview-totals">
            <div><span>Due now (estimated)</span><strong>{preview.immediate ? money(preview.immediate.total, preview.currency) : money(0, preview.currency)}</strong></div>
            {preview.next && <div><span>Next invoice estimate</span><strong>{money(preview.next.total, preview.currency)}</strong></div>}
          </div>
          <p className="plan-select__preview-note">Final taxes, credits and payment amounts are calculated by Paddle. This is a recurring subscription change.</p>
          <div className="plan-select__dialog-actions">
            <button type="button" autoFocus className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => setPreview(null)}>Keep current plan</button>
            <button type="button" className="btn btn-cream" disabled={Boolean(busy)} onClick={confirmChange}>{busy ? "Updating…" : "Confirm plan change"}</button>
          </div>
        </section>
      </div>}

      <p className="plan-select__foot">Checkout and subscription changes are handled by Paddle. By continuing you agree to our <Link to="/terms">Terms</Link> and <Link to="/refund-policy">Refund Policy</Link>. Prices shown are the current proposed USD catalog; Paddle confirms the final total and tax.</p>
      {isReturningCustomer && <p className="plan-select__foot"><Link to={WORKSPACE}>Return to workspace</Link> · <Link to="/billing">View subscription and usage</Link></p>}
    </main>
  </div>;
}
