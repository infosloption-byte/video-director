import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./RenderQuota.css";
import { quotaView } from "../lib/renderQuota";

export function useRenderQuota() {
  const [quota, setQuota] = useState(null);
  const [quotaError, setQuotaError] = useState("");
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/billing/me", { credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.plan) throw new Error(data.error || "Quota is unavailable.");
      setQuota(data);
      setQuotaError("");
      return data;
    } catch (error) {
      setQuotaError(error.message || "Quota is unavailable.");
      return null;
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    // Signed Paddle webhooks may change a plan while the page remains open.
    const interval = window.setInterval(onVisible, 30_000);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);
  return { quota, quotaError, loading, refresh };
}

export default function RenderQuota({ quota, quotaError, loading, refresh, compact = false, limitReached = false }) {
  const view = quotaView(quota, limitReached);
  const { limit: allowance, used, remaining, percent: fraction, approaching: warning } = view;
  const exhausted = view.exhausted || view.blocked;
  const resetAt = quota?.resetAt || view.resetAt;
  const resetLabel = resetAt && !Number.isNaN(Date.parse(resetAt))
    ? new Date(resetAt).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" })
    : "the next UTC month";
  return <section className={`render-quota${compact ? " render-quota--compact" : ""}`} aria-label="Monthly render allowance">
    <div className="render-quota__top"><strong>Monthly render credits</strong><button type="button" className="render-quota__refresh" onClick={() => void refresh()} aria-label="Refresh render credits">Refresh</button></div>
    {quota ? <>
      <p><strong>{remaining}</strong> remaining of {allowance} · {used} used</p>
      <div className="render-quota__track" role="progressbar" aria-label="Monthly render credits used" aria-valuemin={0} aria-valuemax={allowance || 1} aria-valuenow={Math.min(used, allowance || 1)}><span style={{ width: `${fraction}%` }}/></div>
      <small>Resets {resetLabel} at 00:00 UTC</small>
      {exhausted && <p className="render-quota__warning" role="alert">{remaining <= 0 ? "Your monthly render credits are exhausted." : "Your plan limit was reached for this render."} <Link to="/choose-plan?mode=upgrade">Upgrade plan</Link>{remaining <= 0 ? " or wait for the UTC reset." : " to increase your limits."}</p>}
      {warning && !exhausted && <p className="render-quota__warning" role="status">You have used {fraction}% of this month's renders. <Link to="/choose-plan?mode=upgrade">Upgrade plan</Link> for more credits.</p>}
    </> : <p role="status">{loading ? "Loading render allowance…" : "Render allowance unavailable. Refresh to try again."}</p>}
    {quotaError && <p className="render-quota__warning" role="alert">{quotaError}</p>}
    {limitReached && !quota && <Link to="/choose-plan?mode=upgrade">Upgrade plan</Link>}
  </section>;
}
