import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, next, navigate]);

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/signin", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Sign in failed.");
      await refresh(); navigate(next, { replace: true });
    } catch (err) { setError(err.message || "Sign in failed."); }
    finally { setBusy(false); }
  }

  return (
    <div className="hx-page auth-page">
      <Header right={<Link to="/" className="btn btn-ghost">Signals</Link>} />
      <main className="auth-page__main">
        <div className="auth-shell">
          <section className="auth-pitch">
            <p className="eyebrow">Welcome back</p>
            <h1>Turn signals into finished reels.</h1>
            <p>Pick up where you left off with your research, storyboards, narration, and video projects.</p>
            <div className="auth-pitch__steps"><span>01 · Research</span><span>02 · Direct</span><span>03 · Render</span></div>
          </section>
          <section className="auth-card" aria-labelledby="signin-title">
            <div className="auth-card__intro"><p className="eyebrow">Sign in</p><h2 id="signin-title">Welcome to your workspace.</h2><p>Use your Helix account to continue.</p></div>
            {error && <div className="auth-card__error" role="alert">{error}</div>}
            <form className="auth-card__form" onSubmit={submit}>
              <label><span>Email address</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" required /></label>
              <div className="auth-field-group"><label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Your password" required /></label><Link className="auth-card__forgot" to={`/forgot-password${next !== "/my-research" ? `?next=${encodeURIComponent(next)}` : ""}`}>Forgot password?</Link></div>
              <button className="btn btn-cream auth-card__submit" disabled={busy}>{busy ? "Signing in…" : "Sign in →"}</button>
            </form>
            <div className="auth-card__switch"><span>New to Helix?</span><Link to={`/signup${next !== "/my-research" ? `?next=${encodeURIComponent(next)}` : ""}`}>Create a free account</Link></div>
          </section>
        </div>
      </main>
    </div>
  );
}
