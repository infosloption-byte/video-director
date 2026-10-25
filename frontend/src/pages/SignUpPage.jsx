import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PublicHeader from "../components/PublicHeader";
import LegalFooter from "../components/LegalFooter";
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
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) navigate(user.emailVerifiedAt ? next : "/verify-email", { replace: true });
  }, [user, next, navigate]);

  async function submit(event) {
    event.preventDefault();
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    if (!adultConfirmed || !termsAccepted) { setError("Confirm your age and accept the Terms & Conditions to create an account."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/signup", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, displayName, password, adultConfirmed, termsAccepted }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Account creation failed.");
      await refresh();
      navigate("/verify-email", { replace: true, state: { fresh: true } });
    } catch (err) { setError(err.message || "Account creation failed."); }
    finally { setBusy(false); }
  }

  return (
    <div className="hx-page auth-page">
      <PublicHeader />
      <main className="auth-page__main">
        <div className="auth-shell auth-shell--signup">
          <section className="auth-pitch">
            <p className="eyebrow">Start creating</p>
            <h1>Your ideas in. Better reels out.</h1>
            <p>Create a Voxora workspace for research, storyboards, narration, renders, and the advanced editor.</p>
            <div className="auth-pitch__features"><span><strong>Research</strong><small>Trusted signals and evidence.</small></span><span><strong>Direct</strong><small>AI-assisted stories and visuals.</small></span><span><strong>Finish</strong><small>Narration, captions, and video.</small></span></div>
          </section>
          <section className="auth-card" aria-labelledby="signup-title">
            <div className="auth-card__intro"><p className="eyebrow">Create account</p><h2 id="signup-title">Build your Voxora workspace.</h2><p>Save your work and return to it whenever you are ready.</p></div>
            {error && <div className="auth-card__error" role="alert">{error}</div>}
            <form className="auth-card__form" onSubmit={submit}>
              <label><span>Name <em>optional</em></span><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={120} autoComplete="name" placeholder="Your name" /></label>
              <label><span>Email address</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" required /></label>
              <label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete="new-password" placeholder="At least 8 characters" required /></label>
              <label><span>Confirm password</span><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} autoComplete="new-password" placeholder="Repeat your password" required /></label>
              <div className="auth-consent-options">
                <label className="auth-consent-option"><input type="checkbox" checked={adultConfirmed} onChange={e=>setAdultConfirmed(e.target.checked)} /><span>I confirm I am 18 or older.</span></label>
                <label className="auth-consent-option"><input type="checkbox" checked={termsAccepted} onChange={e=>setTermsAccepted(e.target.checked)} /><span>I agree to the <Link to="/terms" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</Link> and acknowledge the <Link to="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>, including the separate rules for voice cloning.</span></label>
              </div>
              <p className="auth-card__hint">Voice cloning is optional and requires additional consent in the voice-profile workflow.</p>
              <button className="btn btn-cream auth-card__submit" disabled={busy}>{busy ? "Creating account…" : "Create free account →"}</button>
            </form>
            <div className="auth-card__switch"><span>Already have an account?</span><Link to={`/signin${next !== "/my-research" ? `?next=${encodeURIComponent(next)}` : ""}`}>Sign in</Link></div>
          </section>
        </div>
      </main>
    <LegalFooter />
    </div>
  );
}
