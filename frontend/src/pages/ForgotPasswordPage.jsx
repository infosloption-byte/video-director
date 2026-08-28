import { useState } from "react";
import { Link } from "react-router-dom";
import Header from "../components/Header";
import "./AuthPage.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage(""); setResetUrl("");
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to prepare a reset link.");
      setMessage(data.message || "Check your email for a reset link.");
      if (data.resetUrl) setResetUrl(data.resetUrl);
    } catch (err) { setError(err.message || "Unable to prepare a reset link."); }
    finally { setBusy(false); }
  }

  return <div className="hx-page auth-page"><Header right={<Link to="/signin" className="btn btn-ghost">Sign in</Link>} /><main className="container auth-page__main"><section className="auth-card"><p className="eyebrow">Account recovery</p><h1>Reset your password.</h1><p>Enter your account email and Helix will prepare a secure, time-limited reset link.</p>{error && <div className="auth-card__error" role="alert">{error}</div>}{message && <div className="auth-card__success" role="status">{message}{resetUrl && <div className="auth-card__dev-note">Development reset URL: {resetUrl}</div>}</div>}<form className="auth-card__form" onSubmit={submit}><label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label><button className="btn btn-cream auth-card__submit" disabled={busy}>{busy ? "Preparing…" : "Send reset link →"}</button></form></section></main></div>;
}
