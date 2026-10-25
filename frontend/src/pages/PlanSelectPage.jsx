import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { openPaddleCheckout } from "../lib/paddle";
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
  const [params, setParams] = useSearchParams();
  const [catalog, setCatalog] = useState(null);
  const [billing, setBilling] = useState(null);
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
  const selectedPlan = params.get("plan");
  const isReturningCustomer = Boolean(user?.planSelectedAt || ["active", "trialing"].includes(billing?.subscription?.status)) && params.get("onboarding") !== "1";


  useEffect(() => {
    if (status !== "ready" || !user?.emailVerifiedAt) return undefined;
    let active = true;
    Promise.all([api("/api/billing/plans"), api("/api/billing/me")])
      .then(([plans, account]) => { if (active) { setCatalog(plans); setBilling(account); } })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [status, user?.id, user?.emailVerifiedAt]);


  useEffect(() => {
    if (!pending || !user?.id) return undefined;
    let active = true;
    let inFlight = false;
    let checks = 0;
    const verify = async () => {
      if (inFlight || !active) return;
      inFlight = true;
      checks += 1;
      try {
        const result = pending.type === "checkout"
          ? await api(`/api/billing/checkout-status?transactionId=${encodeURIComponent(pending.id)}`)
          : await api("/api/billing/me");
        const confirmed = pending.type === "checkout"
          ? result.confirmed
          : result.plan?.id === pending.plan && ["active", "trialing"].includes(result.subscription?.status);
        if (confirmed && active) {
          await refresh();
          if (!active) return;
          navigate(isReturningCustomer ? "/billing?updated=1" : WORKSPACE, { replace: true });
          return;
        }
        if (checks >= MAX_CHECKS && active) setVerificationDelayed(true);
      } catch (e) {
        if (active) { setMessage("We're checking with Paddle. Your payment may still be processing."); }
      } finally {
        inFlight = false;
      }
    };
    void verify();
    const timer = window.setInterval(() => { if (checks < MAX_CHECKS) void verify(); }, WAIT_INTERVAL_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, [pending, retryCount, user?.id, navigate, refresh, isReturningCustomer]);

  useEffect(() => {
    if (!preview) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busy) setPreview(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [preview, busy]);

  if (status === "loading") return null;
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent("/choose-plan" + window.location.search)}`} replace />;
  if (!user.emailVerifiedAt) return <Navigate to="/verify-email" replace />;

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
      await openPaddleCheckout({
        transactionId: data.transactionId,
        clientToken: data.clientToken,
        environment: data.environment,
        customerEmail: user.email,
        successUrl: `${window.location.origin}/choose-plan?transactionId=${encodeURIComponent(data.transactionId)}${isReturningCustomer ? "" : "&onboarding=1"}`,
        onCompleted: () => {
          completedTransaction.current = data.transactionId;
          setParams(isReturningCustomer ? { transactionId: data.transactionId } : { transactionId: data.transactionId, onboarding: "1" }, { replace: true });
          setVerificationDelayed(false);
          setPending({ type: "checkout", id: data.transactionId });
          setMessage("Paddle received the payment. Activating your plan securely…");
          window.Paddle?.Checkout?.close?.();
        },
        onClosed: () => {
          if (completedTransaction.current !== data.transactionId) setMessage("Checkout closed without a confirmed payment. You can reopen checkout.");
        },
        onError: () => setError("Paddle reported a checkout issue. Check your payment details or retry."),
      });
    } catch (e) { setError(e.message); }
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
      setPending({ type: "change", plan });
      setMessage("Paddle is applying your change. Your current plan stays active until we receive confirmation.");
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  function choosePlan(plan) {
    if (plan === "free") return void chooseFree();
    if (billing?.subscription && ["active", "trialing"].includes(billing.subscription.status)) return void previewChange(plan);
    return void newPaidCheckout(plan);
  }

  const currentPlan = billing?.plan?.id || "free";
  const subscription = billing?.subscription;
  const activeSubscription = ["active", "trialing"].includes(subscription?.status);
  const blockedSubscription = subscription && !activeSubscription && !["canceled", "paused"].includes(subscription.status);
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

      {error && <div role="alert" className="plan-select__alert">{error}</div>}
      {message && <div role="status" className="plan-select__notice">{message}</div>}

      {pending && <section className="plan-select__verification" aria-live="polite">
        <span className="plan-select__loading-dot" aria-hidden="true" />
        <div><h2>{verificationDelayed ? "Activation is taking longer than expected" : "Confirming your subscription…"}</h2>
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
              disabled={isDisabled || (same && isReturningCustomer)}
              onClick={() => choosePlan(plan.id)}>
              {busy === plan.id ? "Working…" : cta}
            </button>
          </article>;
        })}
      </div>

      {blockedSubscription && <p className="plan-select__foot">Your existing subscription needs attention before selecting another. <Link to="/billing">Manage payment details in Billing</Link>.</p>}
      {subscription?.cancelAtPeriodEnd && <p className="plan-select__foot">Your subscription has a scheduled cancellation. Manage that in <Link to="/billing">Billing</Link> before changing plans.</p>}

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
