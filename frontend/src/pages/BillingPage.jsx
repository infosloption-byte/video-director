import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import { useAuth } from "../context/AuthContext";
import "./BillingPage.css";

async function readApi(url) {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Unable to load billing.");
  return data;
}

export default function BillingPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([readApi("/api/billing/me"), readApi("/api/billing/plans")])
      .then(([account, plans]) => { if (active) { setData(account); setCatalog(plans); } })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);

  async function portal(action = "payment") {
    setBusy(action); setError("");
    try {
      const result = await readApi(`/api/billing/portal?action=${action}`);
      window.location.assign(result.url);
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  return <div className="hx-page billing-page">
    <Header right={<Link className="btn btn-ghost" to="/my-research">Workspace</Link>} />
    <main className="billing-page__main platform-page-content">
      <p className="eyebrow">Subscription &amp; usage</p>
      <h1>Build at your pace.</h1>
      <p>Manage your subscription and track your monthly render allowance. Changes to paid plans are securely processed by Paddle.</p>
      {params.get("updated") === "1" && <div role="status" className="billing-message">Your new plan is confirmed and active.</div>}
      {error && <div role="alert" className="billing-alert">{error}</div>}
      {!data && !error && <p role="status">Loading your subscription…</p>}
      {!user?.emailVerifiedAt && <div className="billing-alert">Verify your email before purchasing a subscription. <Link to="/verify-email">Verify email →</Link></div>}
      {data && <section className="billing-summary">
        <div><span>Current plan</span><strong>{data.plan.name}</strong><small>{data.subscription?.status || "Free plan"}</small></div>
        <div><span>Renders this month</span><strong>{data.used} / {data.plan.rendersPerMonth}</strong><small>{data.month} (UTC)</small></div>
        <div><span>Remaining</span><strong>{data.remaining}</strong><small>Up to {data.plan.maxSeconds} sec each</small></div>
      </section>}
      <div className="billing-page__plan-heading">
        <div><h2>Choose a plan</h2><p>New subscriptions and upgrades use the same plan selector.</p></div>
        <Link className="btn btn-cream" to="/choose-plan?mode=upgrade">View plans &amp; upgrade →</Link>
      </div>
      <div className="billing-cards">
        {(catalog?.plans || []).map(plan => <article className={plan.id === data?.plan?.id ? "billing-card billing-card--active" : "billing-card"} key={plan.id}>
          <div><span className="eyebrow">{plan.id === data?.plan?.id ? "CURRENT PLAN" : "MONTHLY"}</span><h3>{plan.name}</h3><p>{plan.rendersPerMonth} videos per month · up to {plan.maxSeconds} seconds each</p></div>
          <div className="billing-card__price">${plan.monthlyUsd}<small>/ month</small></div>
          {plan.id === data?.plan?.id
            ? <span className="billing-current">Current plan</span>
            : plan.id === "free"
              ? <span className="billing-current">Included by default</span>
              : <Link className="btn btn-cream" to={`/choose-plan?mode=upgrade&plan=${plan.id}`}>Select {plan.name} →</Link>}
        </article>)}
      </div>
      {data?.subscription && <section className="billing-manage">
        <div><strong>Existing subscription</strong><p>Update your payment details, view invoices or manage cancellation through Paddle.</p></div>
        <button type="button" className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => portal("payment")}>Update payment method ↗</button>
        {!data.subscription.cancelAtPeriodEnd && <button type="button" className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => portal("cancel")}>Cancel subscription ↗</button>}
      </section>}
      <p className="billing-footnote">Plan changes are confirmed from Paddle subscription events. For paid upgrades Paddle may charge a prorated amount immediately; downgrades are prorated on the next billing cycle. Monthly render counts currently reset on the first day of each month (UTC).</p>
    </main>
  </div>;
}
