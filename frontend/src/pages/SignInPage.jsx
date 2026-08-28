import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { useAuth } from "../context/AuthContext";
import "./AuthPage.css";

export default function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refresh } = useAuth();
  const next = new URLSearchParams(location.search).get("next") || "/my-research";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (user) {
    navigate(next, { replace: true });
    return null;
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/signin", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Sign in failed.");
      await refresh();
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message || "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="hx-page auth-page"><Header right={<Link to="/" className="btn btn-ghost">Signals</Link>} /><main className="container auth-page__main"><section className="auth-card"><p className="eyebrow">Welcome back</p><h1>Sign in to Helix.</h1><p>Continue your research and video workspace.</p>{error && <div className="auth-card__error" role="alert">{error}</div>}<form className="auth-card__form" onSubmit={submit}><label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label><label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label><Link className="auth-card__forgot" to={`/forgot-password${next !== "/my-research" ? `?next=${encodeURIComponent(next)}` : ""}`}>Forgot password?</Link><button className="btn btn-cream auth-card__submit" disabled={busy}>{busy ? "Signing in…" : "Sign in →"}</button></form><div className="auth-card__switch"><span>New to Helix?</span><Link to={`/signup${next !== "/my-research" ? `?next=${encodeURIComponent(next)}` : ""}`}>Create account</Link></div></section></main></div>;
}
