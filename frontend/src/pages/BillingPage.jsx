import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import "./BillingPage.css";

async function request(url) {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Unable to load billing details.");
  return data;
}

function dateLabel(value, includeTime = false) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}
function money(minor, currency) {
  if (minor === null || minor === undefined) return "—";
  const amount = Number(minor);
  if (!Number.isFinite(amount)) return "—";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(amount / 100); }
  catch { return `${(amount / 100).toFixed(2)} ${currency || "USD"}`; }
}
function statusLabel(value) {
  return ({
    free: "Free", active: "Active", trialing: "Trial", canceled: "Canceled", past_due: "Past due",
    paused: "Paused", completed: "Paid", paid: "Processing", ready: "Ready",
    billed: "Billed", draft: "Draft", failed: "Failed", processing: "Processing",
  })[value] || (value ? value.replaceAll("_", " ") : "Free");
}
function StatusPill({ value }) {
  return <span className={`billing-status billing-status--${["active","completed"].includes(value) ? "good" : ["past_due","failed","canceled"].includes(value) ? "attention" : "neutral"}`}>
    <span aria-hidden="true" className="billing-status__dot" />{statusLabel(value)}
  </span>;
}
const FILTERS = [
  { value: "all", label: "All payments" },
  { value: "completed", label: "Paid" },
  { value: "past_due", label: "Payment issues" },
  { value: "other", label: "Other" },
];
function SectionHeading({ eyebrow, title, description, action, id }) {
  return <div className="billing-section-heading">
    <div><p className="eyebrow">{eyebrow}</p><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</div>
    {action}
  </div>;
}

export default function BillingPage() {
  const [params] = useSearchParams();
  const [overview, setOverview] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [activity, setActivity] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [sections, setSections] = useState({ transactions: "", activity: "" });
  const [filter, setFilter] = useState("all");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [updated, setUpdated] = useState(params.get("updated") === "1");
  const cancelButton = useRef(null);
  const closeButton = useRef(null);
  const mounted = useRef(true);

  const loadBilling = useCallback(async () => {
    setLoading(true);
    setError("");
    const [summary, history, timeline, plans] = await Promise.allSettled([
      request("/api/billing/dashboard"),
      request("/api/billing/dashboard/transactions"),
      request("/api/billing/dashboard/activity"),
      request("/api/billing/plans"),
    ]);
    if (!mounted.current) return;
    if (summary.status === "fulfilled") setOverview(summary.value);
    else setError(summary.reason?.message || "Unable to load your subscription.");
    if (history.status === "fulfilled") {
      setTransactions(history.value.items || []);
      setCursor(history.value.nextCursor || null);
      setSections(old => ({ ...old, transactions: "" }));
    } else setSections(old => ({ ...old, transactions: history.reason?.message || "Transaction history could not be loaded." }));
    if (timeline.status === "fulfilled") {
      setActivity(timeline.value.items || []);
      setSections(old => ({ ...old, activity: (timeline.value.warnings || []).join(" ") }));
    } else setSections(old => ({ ...old, activity: timeline.reason?.message || "Billing activity could not be loaded." }));
    if (plans.status === "fulfilled") setCatalog(plans.value.plans || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const start = window.setTimeout(() => { void loadBilling(); }, 0);
    return () => { mounted.current = false; window.clearTimeout(start); };
  }, [loadBilling]);

  useEffect(() => {
    if (!cancelOpen) return undefined;
    const oldOverflow = document.body.style.overflow;
    const restoreFocus = cancelButton.current;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    function onKey(event) {
      if (event.key === "Escape") setCancelOpen(false);
      if (event.key === "Tab") {
        // Contain keyboard navigation inside the small confirmation dialog.
        const nodes = [...document.querySelectorAll(".billing-dialog button:not(:disabled)")];
        if (!nodes.length) return;
        if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1).focus(); }
        else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", onKey);
      restoreFocus?.focus();
    };
  }, [cancelOpen]);

  async function goToPaddle(action) {
    if (busy) return;
    setBusy(action);
    setError("");
    try {
      const data = await request(`/api/billing/dashboard/manage?action=${encodeURIComponent(action)}`);
      // Paddle controls the final cancellation/payment decision. Never
      // locally claim a subscription changed before its signed webhook.
      if (typeof data.url !== "string" || !data.url.startsWith("https://"))
        throw new Error("Paddle management link is unavailable.");
      window.location.assign(data.url);
    } catch (err) {
      setError(err.message || "Could not open Paddle billing management.");
      setCancelOpen(false);
    } finally { if (mounted.current) setBusy(""); }
  }

  async function openInvoice(transaction) {
    if (busy || !transaction.invoiceAvailable) return;
    setBusy(transaction.id);
    setError("");
    try {
      const invoice = await request(`/api/billing/dashboard/invoice/${encodeURIComponent(transaction.id)}`);
      if (!invoice?.url?.startsWith("https://")) throw new Error("Paddle invoice link is unavailable.");
      window.location.assign(invoice.url);
    } catch (err) {
      setError(err.message || "Could not open this invoice.");
    } finally { if (mounted.current) setBusy(""); }
  }

  async function loadMore() {
    if (busy || !cursor) return;
    setBusy("more");
    try {
      const history = await request(`/api/billing/dashboard/transactions?cursor=${encodeURIComponent(cursor)}`);
      setTransactions(current => {
        const seen = new Set(current.map(item => item.id));
        return [...current, ...(history.items || []).filter(item => !seen.has(item.id))];
      });
      setCursor(history.nextCursor || null);
      setSections(old => ({ ...old, transactions: "" }));
    } catch (err) {
      setSections(old => ({ ...old, transactions: err.message || "More transactions could not be loaded." }));
    } finally { setBusy(""); }
  }

  const account = overview?.account;
  const subscription = overview?.subscription;
  const currentPlan = account?.plan;
  const hasPaid = Boolean(subscription);
  const subscribedPlan = catalog.find(plan => plan.id === subscription?.plan)
    || (hasPaid ? {
      name: subscription.plan === "studio" ? "Studio" : subscription.plan === "creator" ? "Creator" : "Paid",
      monthlyUsd: subscription.standardMonthlyUsd,
    } : currentPlan);
  const isPastDue = subscription?.status === "past_due";
  const isScheduled = Boolean(subscription?.cancellationScheduled);
  const isActive = ["active","trialing"].includes(subscription?.status);
  const shownTransactions = transactions.filter(item => filter === "all" ? true
    : filter === "completed" ? item.status === "completed"
      : filter === "past_due" ? ["past_due","failed"].includes(item.status)
        : !["completed","past_due","failed"].includes(item.status));
  const creditsPercent = currentPlan?.rendersPerMonth
    ? Math.min(100, Math.max(0, ((account?.used || 0) / currentPlan.rendersPerMonth) * 100)) : 0;

  return <div className="hx-page billing-page">
    <Header right={<Link className="btn btn-ghost" to="/my-research">Open workspace →</Link>} />
    <main className="platform-page-content billing-page__main">
      <div className="billing-top">
        <div>
          <p className="eyebrow">ACCOUNT / SUBSCRIPTION &amp; BILLING</p>
          <h1>Billing, made clear.</h1>
          <p>Everything about your Voxora subscription, payments and invoices in one place.</p>
        </div>
        <button type="button" className="btn btn-ghost billing-refresh" disabled={Boolean(busy || loading)} onClick={() => { setUpdated(false); void loadBilling(); }}>
          {loading ? "Updating…" : "↻ Refresh billing status"}
        </button>
      </div>

      {updated && <div className="billing-notice" role="status">Your plan change has been recorded. Review the current subscription status below.</div>}
      {error && <div className="billing-alert" role="alert">{error} <button type="button" onClick={() => void loadBilling()}>Retry</button></div>}
      {loading && !overview && <div className="billing-placeholder" role="status">Loading your subscription and recent payments…</div>}
      {overview?.warnings?.map((warning, index) => <div className="billing-warning" role="status" key={index}>{warning}</div>)}

      {account && <section className="billing-overview" aria-label="Subscription overview">
        <div className="billing-overview__hero">
          <div className="billing-overview__hero-head">
            <div><span className="eyebrow">YOUR CURRENT PLAN</span><h2>{subscribedPlan?.name || "Free"}</h2></div>
            <StatusPill value={subscription?.status || "free"} />
          </div>
          <p className="billing-overview__price">
            {subscribedPlan?.monthlyUsd ? `${Number(subscribedPlan.monthlyUsd).toFixed(2)}` : "$0.00"}<small> / month standard plan price</small>
          </p>
          <p className="billing-overview__note">{isScheduled
            ? "Your subscription is scheduled to end. You retain paid access until the cancellation takes effect."
            : isPastDue ? "An overdue payment needs your attention. Open Paddle to update your payment details."
              : isActive ? "Your Voxora subscription is active and renews automatically unless you cancel."
                : hasPaid ? "Your subscription status is shown below. Paid access follows confirmed Paddle billing events."
                  : "You're on Free. Upgrade when you're ready to create more videos."}</p>
          <div className="billing-overview__hero-actions">
            <Link className="btn btn-cream" to="/choose-plan?mode=upgrade">Explore plans →</Link>
            {hasPaid && <button type="button" className="btn btn-ghost" disabled={Boolean(busy || subscription?.readOnly)} onClick={() => void goToPaddle("overview")}>Paddle customer portal ↗</button>}
          </div>
        </div>
        <div className="billing-overview__details">
          <div><span>Subscription status</span><strong>{isScheduled ? "Cancellation scheduled" : statusLabel(subscription?.status)}</strong></div>
          <div><span>Current billing period</span><strong>{subscription?.billingPeriodStart ? `${dateLabel(subscription.billingPeriodStart)} – ${dateLabel(subscription.billingPeriodEnd)}` : subscription?.billingPeriodEnd ? `Ends ${dateLabel(subscription.billingPeriodEnd)}` : "Free plan"}</strong></div>
          <div><span>{isScheduled ? "Access continues until" : "Next renewal"}</span><strong>{dateLabel(isScheduled ? subscription.cancelEffectiveAt : subscription?.renewalDate)}</strong></div>
          <div><span>Billing frequency</span><strong>{subscription?.billingCycle ? `Every ${subscription.billingCycle.frequency} ${subscription.billingCycle.interval}${subscription.billingCycle.frequency === 1 ? "" : "s"}` : "—"}</strong></div>
          <div><span>Auto-renewal</span><strong>{isScheduled || subscription?.status === "canceled" ? "Off" : isActive ? "On" : "—"}</strong></div>
          <div><span>Monthly video allowance</span><strong>{currentPlan?.rendersPerMonth ?? "—"} renders · {currentPlan?.maxSeconds ?? "—"}s each</strong></div>
        </div>
      </section>}

      {account && <section className="billing-usage" aria-label="Monthly usage">
        <div className="billing-usage__heading">
          <div><span className="eyebrow">RENDER ALLOWANCE</span><h2>Usage this month</h2><p>Usage resets monthly in UTC, separately from your Paddle renewal date.</p></div>
          <div className="billing-usage__numbers"><strong>{account.used ?? 0}<small> / {currentPlan?.rendersPerMonth || 0}</small></strong><span>{account.remaining ?? 0} remaining</span></div>
        </div>
        <div className="billing-usage__track" role="progressbar" aria-label="Monthly video renders used" aria-valuemin={0} aria-valuemax={currentPlan?.rendersPerMonth || 1} aria-valuenow={Math.min(account.used || 0, currentPlan?.rendersPerMonth || 1)}><span style={{ width: `${creditsPercent}%` }} /></div>
      </section>}

      {hasPaid && <section className="billing-manage-card" aria-label="Payment and cancellation management">
        <SectionHeading eyebrow="MANAGE BILLING" title="Keep everything running." description="Secure changes are completed on Paddle. Voxora never stores your card details." />
        {isPastDue && <div className="billing-past-due" role="alert">
          <strong>Payment needs attention</strong>
          <p>Your latest renewal payment could not be collected. Update your payment method through Paddle to recover the subscription. Don't initiate a second plan checkout.</p>
          <button className="btn btn-cream" type="button" disabled={Boolean(busy || subscription.readOnly)} onClick={() => void goToPaddle("retry")}>Resolve payment in Paddle ↗</button>
        </div>}
        {isScheduled && <div className="billing-cancellation">
          <strong>Cancellation scheduled</strong>
          <p>Your {subscribedPlan?.name} plan will stop on <strong>{dateLabel(subscription.cancelEffectiveAt)}</strong>. Paid access continues until Paddle confirms the cancellation has taken effect. You won't be billed for another renewal after cancellation.</p>
        </div>}
        <div className="billing-management-actions">
          <div><h3>Payment method</h3><p>Update your saved card or billing information through Paddle's secure portal.</p>
            <button type="button" className="btn btn-ghost" disabled={Boolean(busy || !subscription.canManagePayment)} onClick={() => void goToPaddle("payment")}>Update payment method ↗</button>
          </div>
          <div><h3>Subscription controls</h3><p>Review your plan, invoices or schedule a cancellation in Paddle.</p>
            {subscription.canCancel
              ? <button type="button" className="btn btn-ghost" disabled={Boolean(busy)} ref={cancelButton} onClick={() => setCancelOpen(true)}>Cancel subscription</button>
              : <button type="button" className="btn btn-ghost" disabled={Boolean(busy || subscription.readOnly)} onClick={() => void goToPaddle("overview")}>View subscription in Paddle ↗</button>}
          </div>
        </div>
      </section>}

      <section className="billing-history" aria-labelledby="billing-history-title">
        <SectionHeading eyebrow="PAYMENT RECORDS" id="billing-history-title" title="Invoices & transactions" description="All amounts below are actual Paddle transaction totals, including any applied taxes and proration."
          action={<button type="button" className="billing-text-button" disabled={Boolean(busy || loading)} onClick={() => void loadBilling()}>Refresh history ↻</button>} />
        <div className="billing-filters" role="group" aria-label="Transaction status filter">
          {FILTERS.map(option => <button key={option.value} type="button" className={filter === option.value ? "is-active" : ""} aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>{option.label}</button>)}
        </div>
        {sections.transactions && <div className="billing-warning" role="alert">{sections.transactions} <button type="button" onClick={() => void loadBilling()}>Try again</button></div>}
        <div className="billing-transactions" aria-label="Transaction history">
          {shownTransactions.length
            ? shownTransactions.map(transaction => <article className="billing-transaction" key={transaction.id}>
                <div className="billing-transaction__title">
                  <span className="billing-transaction__icon" aria-hidden="true">↗</span>
                  <div><strong>{transaction.description}</strong><small>{dateLabel(transaction.billedAt, true)} · {transaction.invoiceNumber ? `Invoice ${transaction.invoiceNumber}` : "Invoice number pending"}</small></div>
                </div>
                <div className="billing-transaction__amount"><strong>{money(transaction.amountMinor, transaction.currency)}</strong><StatusPill value={transaction.status} /></div>
                <div className="billing-transaction__action">
                  {transaction.invoiceAvailable
                    ? <button type="button" className="billing-text-button" disabled={Boolean(busy)} onClick={() => void openInvoice(transaction)}>{busy === transaction.id ? "Opening…" : "View PDF invoice ↗"}</button>
                    : <span>Invoice unavailable</span>}
                </div>
              </article>)
            : <div className="billing-empty">{loading ? "Loading transactions…" : filter === "all" ? "No Paddle transactions have been recorded for this subscription yet." : "No transactions match this filter."}</div>}
        </div>
        {cursor && <div className="billing-load-more"><button className="btn btn-ghost" type="button" disabled={Boolean(busy)} onClick={() => void loadMore()}>{busy === "more" ? "Loading…" : "Load more transactions"}</button></div>}
      </section>

      <section className="billing-activity" aria-labelledby="billing-activity-title">
        <SectionHeading eyebrow="SUBSCRIPTION TIMELINE" id="billing-activity-title" title="Billing activity" description="Recent subscription changes, renewals and payment events recorded by Paddle." />
        {sections.activity && <div className="billing-warning" role="status">{sections.activity}</div>}
        {activity.length ? <ol className="billing-timeline">
          {activity.map(item => <li key={item.id}>
            <span aria-hidden="true" className={`billing-timeline__marker ${item.type.includes("failed") || item.type.includes("past_due") ? "is-attention" : ""}`} />
            <div><strong>{item.title}</strong><p>{item.detail || "Recorded by the billing provider"}</p></div>
            <time dateTime={item.occurredAt}>{dateLabel(item.occurredAt, true)}</time>
          </li>)}
        </ol> : <div className="billing-empty">{loading ? "Loading recent billing activity…" : "No activity has been recorded for this subscription yet."}</div>}
      </section>

      <p className="billing-footnote">Paddle is the merchant of record for paid subscriptions. Payment methods and invoices are managed securely through Paddle. Local access rights update after Voxora verifies signed Paddle subscription events.</p>
    </main>

    {cancelOpen && <div className="billing-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setCancelOpen(false); }}>
      <section className="billing-dialog" role="dialog" aria-modal="true" aria-labelledby="billing-cancel-title" aria-describedby="billing-cancel-description">
        <span className="eyebrow">SUBSCRIPTION CANCELLATION</span>
        <h2 id="billing-cancel-title">Cancel your {subscribedPlan?.name} plan?</h2>
        <p id="billing-cancel-description">You'll be taken to Paddle to confirm your request. Voxora will not cancel your plan just by opening this dialog.</p>
        <div className="billing-dialog__details">
          <div><span>Subscription</span><strong>{subscribedPlan?.name}</strong></div>
          <div><span>Expected end of access</span><strong>{dateLabel(subscription?.billingPeriodEnd)}</strong></div>
          <div><span>Until then</span><strong>Your confirmed paid features remain available</strong></div>
        </div>
        <p className="billing-dialog__note">Paddle will show the actual cancellation date before you confirm. Once scheduled, renewals will stop at the end of your paid period. This action doesn't issue a refund.</p>
        <div className="billing-dialog__actions">
          <button ref={closeButton} type="button" className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => setCancelOpen(false)}>Keep subscription</button>
          <button type="button" className="btn btn-cream" disabled={Boolean(busy)} onClick={() => void goToPaddle("cancel")}>{busy === "cancel" ? "Opening Paddle…" : "Continue to Paddle ↗"}</button>
        </div>
      </section>
    </div>}
  </div>;
}
