import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PublicHeader from "../components/PublicHeader";
import LegalFooter from "../components/LegalFooter";
import { useAuth } from "../context/AuthContext";
import { authPath, destinationFromSearch, unfinishedPlanDestination } from "../lib/onboarding";
import "./AuthPage.css";

export default function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const search = new URLSearchParams(location.search);
  const token = search.get("token") || "";
  const next = destinationFromSearch(location.search, "/my-research");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invalidLink, setInvalidLink] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!token) { setInvalidLink(true); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 400 && /invalid|expired/i.test(data.error || "")) setInvalidLink(true);
        throw new Error(data.error || "Password reset failed.");
      }
      await refresh();
      navigate(unfinishedPlanDestination(data.user, next), { replace: true });
    } catch (err) { setError(err.message || "Password reset failed."); }
    finally { setBusy(false); }
  }

  return <div className="hx-page auth-page">
    <PublicHeader />
    <main className="auth-page__main">
      <section className="auth-card auth-card--recovery">
        <p className="eyebrow">Secure recovery</p>
        <h1>Choose a new password.</h1>
        <p>Your reset link expires after two hours and can only be used once.</p>
        {!token && <div className="auth-card__error" role="alert">Your password-reset link is missing. Request a new one below.</div>}
        {error && <div className="auth-card__error" role="alert">{error}</div>}
        {(invalidLink || !token) ? <div className="auth-recovery-links">
          <Link className="btn btn-cream" to={authPath("/forgot-password", next)}>Request a new reset link →</Link>
          <Link to={authPath("/signin", next)}>Return to sign in</Link>
        </div> : <form className="auth-card__form" onSubmit={submit}>
          <label><span>New password</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} autoComplete="new-password" required /></label>
          <label><span>Confirm password</span><input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={8} autoComplete="new-password" required /></label>
          <button className="btn btn-cream auth-card__submit" disabled={busy || password.length < 8 || confirm.length < 8}>{busy ? "Updating…" : "Reset password →"}</button>
        </form>}
      </section>
    </main>
    <LegalFooter />
  </div>;
}
