import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import PublicHeader from "../components/PublicHeader";
import LegalFooter from "../components/LegalFooter";
import SessionGate from "../components/SessionGate";
import { useAuth } from "../context/AuthContext";
import { authPath, destinationFromSearch, unfinishedPlanDestination, verificationPath } from "../lib/onboarding";
import "./AuthPage.css";

// React StrictMode replays effects; reuse the in-flight request for single-use tokens.
const verificationRequests = new Map();
function verifyTokenOnce(token) {
  if (!verificationRequests.has(token)) {
    verificationRequests.set(token, fetch("/api/auth/verify-email", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ token })
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Verification failed.");
      return data;
    }));
  }
  return verificationRequests.get(token);
}

/** Legacy path: the "Verify email" button inside the email carries a one-time token. */
function LinkVerification({ token, next }) {
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const [status, setStatus] = useState("working");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await verifyTokenOnce(token);
        if (cancelled) return;
        await refresh();
        if (cancelled) return;
        setStatus("done");
        setMessage("Your email is verified. Taking you to plan selection…");
        const destination = unfinishedPlanDestination(result.user, next);
        window.setTimeout(() => navigate(destination, { replace: true }), 900);
      } catch (err) {
        if (!cancelled) { setStatus("error"); setMessage(err.message || "Verification failed."); }
      }
    })();
    return () => { cancelled = true; };
  }, [navigate, refresh, token, next]);

  return (
    <div className="hx-page auth-page">
      <PublicHeader />
      <main className="container auth-page__main">
        <section className="auth-card">
          <p className="eyebrow">Email verification</p>
          <h1>{status === "working" ? "Verifying your email…" : status === "done" ? "Email verified." : "Verification failed."}</h1>
          <p>{message}</p>
          {status === "error" && <div className="auth-recovery-links">
            {user ? <Link className="btn btn-cream" to={verificationPath(next)}>Request a new code →</Link> : <Link className="btn btn-cream" to={authPath("/signin", verificationPath(next))}>Sign in to request a new code →</Link>}
            <p>The link may have expired or already been used. Your account remains available.</p>
          </div>}
        </section>
      </main>
      <LegalFooter />
    </div>
  );
}

/** Primary path: enter the 6-digit code emailed after sign-up. */
function CodeVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, status, refresh, signOut } = useAuth();
  const next = destinationFromSearch(location.search, "/choose-plan");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(location.state?.fresh ? 45 : 0);
  const [resending, setResending] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  if (status === "loading") return <SessionGate />;
  if (!user) return <Navigate to={authPath("/signin", verificationPath(next))} replace />;
  if (user.emailVerifiedAt && !done) return <Navigate to={unfinishedPlanDestination(user, next)} replace />;

  async function verify(value) {
    if (busy || done) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/auth/verify-code", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: value }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Verification failed.");
      setDone(true);
      await refresh();
      window.setTimeout(() => navigate(unfinishedPlanDestination(data.user, next), { replace: true }), 700);
    } catch (err) {
      setError(err.message || "Verification failed.");
      setCode("");
      inputRef.current?.focus();
    } finally { setBusy(false); }
  }

  function onChange(event) {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (error) setError("");
    if (digits.length === 6) void verify(digits);
  }

  async function resend() {
    if (cooldown > 0 || resending) return;
    setResending(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/auth/resend-verification", { method: "POST", credentials: "include" });
      const data = await response.json().catch(() => ({}));
      if (response.status === 429 && data.retryAfterSeconds) setCooldown(data.retryAfterSeconds);
      if (!response.ok) throw new Error(data.error || "Could not send a new code.");
      setCooldown(data.retryAfterSeconds || 60);
      setCode("");
      setNotice("A new code is on its way. Older codes no longer work.");
      inputRef.current?.focus();
    } catch (err) { setError(err.message || "Could not send a new code."); }
    finally { setResending(false); }
  }

  async function useDifferentEmail() {
    await signOut();
    navigate(authPath("/signup", next), { replace: true });
  }

  return (
    <div className="hx-page auth-page">
      <PublicHeader />
      <main className="auth-page__main">
        <section className="auth-card auth-card--verify" aria-labelledby="verify-title">
          <div className="auth-verify__icon" aria-hidden="true">✉</div>
          <p className="eyebrow">Step 2 of 3 · Verify email</p>
          <h1 id="verify-title">{done ? "Email verified." : "Check your email."}</h1>
          <p className="auth-verify__lead">{done ? "Taking you to plan selection…" : <>Enter the 6-digit code for <strong>{user.email}</strong>. If it has not arrived, request a new code below.</>}</p>
          {(location.state?.deliveryFailed || new URLSearchParams(location.search).get("delivery") === "failed") && !notice && !done && <div className="auth-card__error" role="alert">Your account was created, but Gmail did not accept the verification email. Select Resend code to try again. You can return to this page later.</div>}
          {error && <div className="auth-card__error" role="alert">{error}</div>}
          {notice && <div className="auth-card__notice" role="status">{notice}</div>}
          {!done && (
            <form className="auth-card__form" onSubmit={(event) => { event.preventDefault(); if (code.length === 6) void verify(code); }}>
              <label className="auth-code">
                <span className="sr-only">6-digit verification code</span>
                <input ref={inputRef} value={code} onChange={onChange} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} placeholder="······" autoFocus disabled={busy} aria-label="6-digit verification code" />
              </label>
              <button className="btn btn-cream auth-card__submit" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify and continue →"}</button>
            </form>
          )}
          {!done && (
            <div className="auth-verify__help">
              <p>Didn't get it? Check your spam folder. The code expires in 15 minutes.</p>
              <button type="button" className="auth-verify__link" onClick={resend} disabled={cooldown > 0 || resending}>{resending ? "Sending…" : cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}</button>
              <button type="button" className="auth-verify__link" onClick={useDifferentEmail}>Wrong email? Start over</button>
            </div>
          )}
        </section>
      </main>
      <LegalFooter />
    </div>
  );
}

export default function VerifyEmailPage() {
  const location = useLocation();
  const token = new URLSearchParams(location.search).get("token") || "";
  const next = destinationFromSearch(location.search, "/choose-plan");
  return token ? <LinkVerification token={token} next={next} /> : <CodeVerification />;
}
