import { useState } from "react";
import { Link } from "react-router-dom";
import Header from "../components/Header";
import { useAuth } from "../context/AuthContext";
import "../components/ui.css";
import "./AuthPage.css";
import "./AccountPage.css";

export default function AccountPage() {
  const { user, refresh } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function saveProfile(event) {
    event.preventDefault();
    setProfileBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/auth/profile", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to update profile.");
      await refresh();
      setMessage("Profile updated.");
    } catch (err) {
      setError(err.message || "Unable to update profile.");
    } finally {
      setProfileBusy(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setPasswordBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/auth/change-password", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to change password.");
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password changed. Other sessions have been signed out.");
    } catch (err) {
      setError(err.message || "Unable to change password.");
    } finally {
      setPasswordBusy(false);
    }
  }

  if (!user) return null;

  return (
    <div className="hx-page auth-page account-page">
      <Header right={<Link to="/my-research" className="btn btn-ghost">My Research</Link>} />
      <main className="container account-page__main">
        <section className="account-page__header">
          <div>
            <p className="eyebrow">Account</p>
            <h1>Manage your Helix account.</h1>
            <p>Your projects and generated media belong to this account.</p>
          </div>
        </section>

        {error && <div className="auth-card__error" role="alert">{error}</div>}
        {message && <div className="account-page__success" role="status">{message}</div>}

        <div className="account-page__grid">
          <section className="auth-card account-card">
            <p className="eyebrow">Profile</p>
            <form className="auth-card__form" onSubmit={saveProfile}>
              <label><span>Email</span><input type="email" value={user.email} readOnly /></label>
              <label><span>Display name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={120} autoComplete="name" /></label>
              <div className="account-card__verification"><span className={`account-card__dot ${user.emailVerifiedAt ? "is-verified" : ""}`} />{user.emailVerifiedAt ? "Email verified" : "Email verification pending"}</div>
              <button className="btn btn-cream auth-card__submit" disabled={profileBusy}>{profileBusy ? "Saving…" : "Save profile →"}</button>
            </form>
          </section>

          <section className="auth-card account-card">
            <p className="eyebrow">Security</p>
            <form className="auth-card__form" onSubmit={changePassword}>
              <label><span>Current password</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
              <label><span>New password</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
              <p className="account-card__hint">Use at least 8 characters. Changing your password signs out other active sessions.</p>
              <button className="btn btn-cream auth-card__submit" disabled={passwordBusy}>{passwordBusy ? "Updating…" : "Change password →"}</button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
