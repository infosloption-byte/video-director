import { useState } from "react";
import PublicHeader from "../components/PublicHeader";
import LegalFooter from "../components/LegalFooter";
import "./AuthPage.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to prepare a reset link.");
      setMessage(data.message || "Check your email for a reset link.");
    } catch (err) { setError(err.message || "Unable to prepare a reset link."); }
    finally { setBusy(false); }
  }

  return <div className="hx-page auth-page"><PublicHeader /><main className="container auth-page__main"><section className="auth-card"><p className="eyebrow">Account recovery</p><h1>Reset your password.</h1><p>Enter your account email and Voxora will email a secure, time-limited link if that address is registered.</p>{error && <div className="auth-card__error" role="alert">{error}</div>}{message && <div className="auth-card__success" role="status">{message}</div>}<form className="auth-card__form" onSubmit={submit}><label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label><button className="btn btn-cream auth-card__submit" disabled={busy}>{busy ? "Preparing…" : "Send reset link →"}</button></form></section></main>
    <LegalFooter /></div>;
}
