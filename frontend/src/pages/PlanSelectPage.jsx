import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { openPaddleCheckout } from "../lib/paddle";
import "./PlanSelectPage.css";

const DESTINATION = "/signals";

const PLAN_NOTES = {
  free: "Everything you need to try Voxora end to end.",
};

export default function PlanSelectPage() {
  const { user, status, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/billing/plans")
      .then((r) => r.json())
      .then((data) => { if (active) setCatalog(data); })
      .catch(() => { if (active) setError("We could not load the plans. Refresh to try again."); });
    return () => { active = false; };
  }, []);

  if (status === "loading") return null;
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent("/choose-plan")}`} replace />;
  if (!user.emailVerifiedAt) return <Navigate to="/verify-email" replace />;

  async function markSelected() {
    const response = await fetch("/api/billing/plan-selected", { method: "POST", credentials: "include" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Could not save your plan choice.");
    }
    await refresh();
  }

  async function continueFree() {
    setBusy("free"); setError("");
    try {
      await markSelected();
      navigate(DESTINATION, { replace: true });
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setBusy("");
    }
  }

  async function choosePaid(plan) {
    setBusy(plan); setError("");
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Unable to start checkout.");
      await openPaddleCheckout({
        transactionId: result.transactionId,
        clientToken: result.clientToken,
        environment: result.environment,
        onCompleted: async () => {
          setActivating(true);
          try {
            await markSelected();
          } catch {
            // Billing page will still show the real subscription state once Paddle confirms.
          }
          navigate(DESTINATION, { replace: true });
        },
      });
    } catch (err) {
      setError(err.message || "Checkout failed. Please try again.");
    } finally {
      setBusy("");
    }
  }

  const plans = catalog?.plans || [];
  const paidReady = Boolean(catalog?.billingReady);

  return (
    <div className="plan-select">
      <header className="plan-select__bar">
        <Link to="/signals" className="plan-select__logo"><span>V</span>Voxora</Link>
        <button type="button" className="plan-select__signout" onClick={() => { navigate("/", { replace: true }); void signOut(); }}>Sign out</button>
      </header>

      <main className="plan-select__main">
        <ol className="plan-select__steps" aria-label="Account setup progress">
          <li className="is-done"><span>✓</span>Account created</li>
          <li className="is-done"><span>✓</span>Email verified</li>
          <li className="is-current"><span>3</span>Choose a plan</li>
        </ol>

        <p className="eyebrow">Almost there</p>
        <h1>Choose how you want to start.</h1>
        <p className="plan-select__lead">Start on the free plan and upgrade whenever you need more renders, or pick a paid plan now. You can change this any time from Billing.</p>

        {error && <div role="alert" className="plan-select__alert">{error}</div>}
        {activating && <div role="status" className="plan-select__notice">Payment received. Taking you to your workspace…</div>}

        <div className="plan-select__grid">
          {!catalog && !error && <div className="plan-select__loading">Loading plans…</div>}
          {plans.map((plan) => {
            const free = plan.id === "free";
            return (
              <article key={plan.id} className={"plan-select__card" + (free ? "" : " is-paid")}>
                <header>
                  <span className="plan-select__tag">{free ? "Free" : "Monthly"}</span>
                  <h2>{plan.name}</h2>
                  <div className="plan-select__price">{free ? "$0" : `$${plan.monthlyUsd}`}<small>{free ? "forever" : "/ month"}</small></div>
                </header>
                <ul>
                  <li>{plan.rendersPerMonth} video renders per month</li>
                  <li>Up to {plan.maxSeconds} seconds per video</li>
                  <li>{free ? PLAN_NOTES.free : "Priority for longer, higher-volume projects"}</li>
                </ul>
                {free ? (
                  <button type="button" className="btn btn-ghost" disabled={Boolean(busy) || activating} onClick={continueFree}>
                    {busy === "free" ? "Setting up…" : "Continue with Free"}
                  </button>
                ) : (
                  <button type="button" className="btn btn-cream" disabled={!paidReady || Boolean(busy) || activating} onClick={() => choosePaid(plan.id)}>
                    {busy === plan.id ? "Opening checkout…" : paidReady ? `Choose ${plan.name} →` : "Checkout unavailable"}
                  </button>
                )}
              </article>
            );
          })}
        </div>

        <p className="plan-select__foot">Payments are handled securely by Paddle. By continuing you agree to our <Link to="/terms">Terms</Link> and <Link to="/refund-policy">Refund Policy</Link>.</p>
      </main>
    </div>
  );
}
