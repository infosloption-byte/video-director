import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { useAuth } from "../context/AuthContext";
import "./AuthPage.css";

export default function ResetPasswordPage() {
  const location = useLocation(); const navigate = useNavigate(); const { refresh } = useAuth();
  const token = new URLSearchParams(location.search).get("token") || "";
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event) { event.preventDefault(); if (password !== confirm) { setError("Passwords do not match."); return; } setBusy(true); setError(""); try { const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ token, password }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Password reset failed."); await refresh(); navigate("/my-research", { replace: true }); } catch (err) { setError(err.message || "Password reset failed."); } finally { setBusy(false); } }
  return <div className="hx-page auth-page"><Header right={<Link to="/signin" className="btn btn-ghost">Sign in</Link>} /><main className="container auth-page__main"><section className="auth-card"><p className="eyebrow">Secure recovery</p><h1>Choose a new password.</h1><p>Your reset link is time-limited. Choose at least 8 characters.</p>{error && <div className="auth-card__error" role="alert">{error}</div>}<form className="auth-card__form" onSubmit={submit}><label><span>New password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete="new-password" required /></label><label><span>Confirm password</span><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} autoComplete="new-password" required /></label><button className="btn btn-cream auth-card__submit" disabled={busy || !token}>{busy ? "Updating…" : "Reset password →"}</button></form></section></main></div>;
}
