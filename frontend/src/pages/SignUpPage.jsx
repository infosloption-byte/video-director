import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { useAuth } from "../context/AuthContext";
import "./AuthPage.css";

export default function SignUpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refresh } = useAuth();
  const next = new URLSearchParams(location.search).get("next") || "/my-research";
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");

  if (user) { navigate(next, { replace: true }); return null; }

  async function submit(event) {
    event.preventDefault();
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/signup", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, displayName, password }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Account creation failed.");
      await refresh();
      setVerificationUrl(data.verificationUrl || "");
      navigate(next, { replace: true });
    } catch (err) { setError(err.message || "Account creation failed."); }
    finally { setBusy(false); }
  }

  return <div className="hx-page auth-page"><Header right={<Link to="/" className="btn btn-ghost">Signals</Link>} /><main className="container auth-page__main"><section className="auth-card"><p className="eyebrow">Create your workspace</p><h1>Build your Helix account.</h1><p>Keep your research, storyboards, narration and future editor projects in one workspace.</p>{error && <div className="auth-card__error" role="alert">{error}</div>}<form className="auth-card__form" onSubmit={submit}><label><span>Display name</span><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={120} autoComplete="name" /></label><label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label><label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete="new-password" required /></label><label><span>Confirm password</span><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} autoComplete="new-password" required /></label><button className="btn btn-cream auth-card__submit" disabled={busy}>{busy ? "Creating account…" : "Create account →"}</button></form><div className="auth-card__switch"><span>Already have an account?</span><Link to={`/signin${next !== "/my-research" ? `?next=${encodeURIComponent(next)}` : ""}`}>Sign in</Link></div>{verificationUrl && <p className="auth-card__dev-note">Development verification URL: {verificationUrl}</p>}</section></main></div>;
}
