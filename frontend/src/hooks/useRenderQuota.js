import { useCallback, useEffect, useState } from "react";

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
    let cancelled = false;
    // Schedule the initial request after effect setup; no synchronous state update.
    void Promise.resolve().then(() => { if (!cancelled) return refresh(); });
    const onFocus = () => { void refresh(); };
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    // Signed Paddle webhooks may change a plan while the page remains open.
    const interval = window.setInterval(onVisible, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);
  return { quota, quotaError, loading, refresh };
}

