import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext.jsx";
import "./SettingsPage.css";

const TABS = [
  { id: "general", label: "General", hint: "Appearance and behavior" },
  { id: "account", label: "Account", hint: "Profile and plan" },
  { id: "security", label: "Security", hint: "Password and devices" },
  { id: "privacy", label: "Privacy", hint: "Data and consent" },
];

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: "include", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

function Switch({ checked, onChange, label, disabled }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={"settings-switch" + (checked ? " is-on" : "")} onClick={() => onChange(!checked)}><span /></button>;
}

function Row({ title, description, children }) {
  return <div className="settings-row"><div className="settings-row__copy"><strong>{title}</strong>{description && <p>{description}</p>}</div><div className="settings-row__control">{children}</div></div>;
}

function Card({ title, description, children, tone }) {
  return <section className={"settings-card" + (tone ? ` settings-card--${tone}` : "")}><header><h2>{title}</h2>{description && <p>{description}</p>}</header><div className="settings-card__body">{children}</div></section>;
}

function describeDevice(userAgent) {
  const ua = String(userAgent || "");
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

const dateFmt = (value) => value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
const dateTimeFmt = (value) => value ? new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

export default function SettingsPage() {
  const { user, refresh, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((item) => item.id === params.get("tab")) ? params.get("tab") : "general";
  const prefs = user?.preferences || {};
  const [toast, setToast] = useState(null);
  const [savingKey, setSavingKey] = useState("");
  const tabRefs = useRef({});
  const savingRef = useRef(false);

  function selectTab(id, focus = false) {
    setParams({ tab: id }, { replace: true });
    if (focus) window.requestAnimationFrame(() => tabRefs.current[id]?.focus());
  }

  function handleTabKey(event, index) {
    let next;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = (index + TABS.length - 1) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    selectTab(TABS[next].id, true);
  }

  function notify(kind, text) {
    setToast({ kind, text, id: Date.now() });
  }
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function savePref(key, value, { silent } = {}) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSavingKey(key);
    try {
      const saved = await api("/api/account/preferences", { method: "PATCH", body: JSON.stringify({ [key]: value }) });
      if (saved.preferences?.[key] !== value) throw new Error("Setting was not confirmed by the server. Please try again.");
      if (key === "sidebarCollapsed") { try { localStorage.setItem("helix.platform.sidebar", value ? "collapsed" : "expanded"); } catch { /* optional */ } }
      const result = await refresh();
      if (!result.user) throw new Error("Setting saved, but account synchronization failed. Sign in again to verify.");
      if (!silent) notify("ok", "Setting saved.");
    } catch (error) {
      notify("error", error.message);
    } finally {
      savingRef.current = false;
      setSavingKey("");
    }
  }

  if (!user) return null;

  return (
    <div className="settings-page platform-page-content">
      <header className="settings-page__head">
        <p className="eyebrow">Settings</p>
        <h1>Settings</h1>
        <p>Manage how Voxora looks and behaves, your account details, security and privacy.</p>
      </header>

      <div className="settings-layout">
        <nav className="settings-tabs" role="tablist" aria-label="Settings sections" aria-orientation="vertical">
          {TABS.map((item) => (
            <button key={item.id} type="button" role="tab" id={`settings-tab-${item.id}`} aria-controls="settings-active-panel" aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} ref={(node) => { tabRefs.current[item.id] = node; }} onKeyDown={(event) => handleTabKey(event, TABS.indexOf(item))} className={tab === item.id ? "is-active" : ""} onClick={() => selectTab(item.id)}>
              <span>{item.label}</span><small>{item.hint}</small>
            </button>
          ))}
        </nav>

        <div id="settings-active-panel" className="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${tab}`} tabIndex={0}>
          {tab === "general" && <GeneralTab prefs={prefs} theme={theme} setTheme={setTheme} savePref={savePref} savingKey={savingKey} />}
          {tab === "account" && <AccountTab user={user} refresh={refresh} notify={notify} />}
          {tab === "security" && <SecurityTab prefs={prefs} savePref={savePref} savingKey={savingKey} notify={notify} />}
          {tab === "privacy" && <PrivacyTab user={user} prefs={prefs} savePref={savePref} savingKey={savingKey} notify={notify} onDeleted={async () => { await signOut(); navigate("/", { replace: true }); }} />}
        </div>
      </div>

      {toast && <div key={toast.id} className={"settings-toast is-" + toast.kind} role={toast.kind === "error" ? "alert" : "status"}>{toast.text}</div>}
    </div>
  );
}

function GeneralTab({ prefs, theme, setTheme, savePref, savingKey }) {
  return (
    <>
      <Card title="Appearance" description="Choose how Voxora looks on this and your other devices.">
        <Row title="Theme" description="Applies everywhere you sign in.">
          <div className="settings-segment" role="radiogroup" aria-label="Theme">
            {["dark", "light"].map((value) => (
              <button key={value} type="button" role="radio" aria-checked={theme === value} className={theme === value ? "is-active" : ""} onClick={() => setTheme(value)}>{value === "dark" ? "Dark" : "Light"}</button>
            ))}
          </div>
        </Row>
        <Row title="Reduce motion" description="Turns off animations and transitions across the app.">
          <Switch label="Reduce motion" checked={Boolean(prefs.reduceMotion)} disabled={savingKey === "reduceMotion"} onChange={(value) => savePref("reduceMotion", value)} />
        </Row>
      </Card>
      <Card title="Workspace" description="Defaults for how the workspace opens.">
        <Row title="Start with the sidebar collapsed" description="Gives your storyboards and editor more room. You can still expand it any time.">
          <Switch label="Start with the sidebar collapsed" checked={Boolean(prefs.sidebarCollapsed)} disabled={savingKey === "sidebarCollapsed"} onChange={(value) => savePref("sidebarCollapsed", value)} />
        </Row>
      </Card>
    </>
  );
}

function AccountTab({ user, refresh, notify }) {
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [billing, setBilling] = useState(null);
  const [billingError, setBillingError] = useState("");
  const [billingLoading, setBillingLoading] = useState(true);
  const dirty = displayName.trim() !== (user.displayName || "");

  useEffect(() => {
    let active = true;
    let controller = null;
    async function loadBilling() {
      controller?.abort();
      controller = new AbortController();
      setBillingLoading(true);
      setBillingError("");
      try {
        const response = await fetch("/api/billing/me", { credentials: "include", cache: "no-store", signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not refresh plan and usage.");
        if (active) setBilling(data);
      } catch (error) {
        if (active && error.name !== "AbortError") setBillingError(error.message || "Could not refresh plan and usage.");
      } finally { if (active && !controller?.signal.aborted) setBillingLoading(false); }
    }
    const onReturn = () => { if (document.visibilityState === "visible") void loadBilling(); };
    const onFocus = () => { void loadBilling(); };
    void loadBilling();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      active = false;
      controller?.abort();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, []);

  async function saveProfile(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/auth/profile", { method: "PATCH", body: JSON.stringify({ displayName }) });
      await refresh();
      notify("ok", "Profile updated.");
    } catch (error) { notify("error", error.message); }
    finally { setBusy(false); }
  }
  async function resend() {
    setResending(true);
    try { const data = await api("/api/auth/resend-verification", { method: "POST", body: "{}" }); notify("ok", data.message || "Verification email sent."); }
    catch (error) { notify("error", error.message); }
    finally { setResending(false); }
  }

  return (
    <>
      <Card title="Profile" description="How you appear in Voxora.">
        <form className="settings-form" onSubmit={saveProfile}>
          <div className="settings-identity"><span className="settings-avatar" aria-hidden="true">{String(user.displayName || user.email).charAt(0).toUpperCase()}</span><div><strong>{user.displayName || "No display name"}</strong><small>{user.email}</small></div></div>
          <label><span>Display name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={120} autoComplete="name" placeholder="Your name" /></label>
          <label><span>Email address</span><input type="email" value={user.email} readOnly aria-readonly="true" /></label>
          <div className="settings-status"><i className={user.emailVerifiedAt ? "is-ok" : "is-warn"} />{user.emailVerifiedAt ? `Email verified on ${dateFmt(user.emailVerifiedAt)}` : "Email verification pending"}{!user.emailVerifiedAt && <button type="button" className="settings-link" onClick={resend} disabled={resending}>{resending ? "Sending…" : "Resend email"}</button>}</div>
          <div className="settings-actions"><button className="btn btn-cream" disabled={busy || !dirty}>{busy ? "Saving…" : "Save changes"}</button>{dirty && <button type="button" className="btn btn-ghost" onClick={() => setDisplayName(user.displayName || "")}>Reset</button>}</div>
        </form>
      </Card>
      <Card title="Plan & usage" description="Your subscription and monthly render allowance.">
        <Row title={billing?.plan?.name ? `${billing.plan.name} plan` : "Current plan"} description={billing ? `${billing.used ?? 0} of ${billing.plan?.rendersPerMonth ?? "—"} renders used this month.` : billingLoading ? "Loading your plan…" : "Plan details unavailable."}>
          <Link className="btn btn-ghost" to="/choose-plan?mode=upgrade">Change plan →</Link>
        </Row>
        {billingError && <p className="settings-field-error" role="alert">{billingError} Return to this tab or focus the window to retry.</p>}
        <Row title="Member since"><span className="settings-value">{dateFmt(user.createdAt)}</span></Row>
      </Card>
    </>
  );
}

function SecurityTab({ prefs, savePref, savingKey, notify }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState(null);
  const [sessionBusy, setSessionBusy] = useState("");
  const mismatch = confirmPassword && newPassword !== confirmPassword;

  async function loadSessions() {
    try { const data = await api("/api/account/sessions"); setSessions(data.sessions); }
    catch (error) { notify("error", error.message); setSessions([]); }
  }
  useEffect(() => {
    let active = true;
    api("/api/account/sessions").then((data) => { if (active) setSessions(data.sessions); }).catch(() => { if (active) setSessions([]); });
    return () => { active = false; };
  }, []);

  async function changePassword(event) {
    event.preventDefault();
    if (newPassword !== confirmPassword) return;
    setBusy(true);
    try {
      await api("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      notify("ok", "Password changed. Other devices were signed out.");
      await loadSessions();
    } catch (error) { notify("error", error.message); }
    finally { setBusy(false); }
  }
  async function revoke(id) {
    setSessionBusy(id);
    try { await api(`/api/account/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }); await loadSessions(); notify("ok", "Device signed out."); }
    catch (error) { notify("error", error.message); }
    finally { setSessionBusy(""); }
  }
  async function revokeOthers() {
    setSessionBusy("all");
    try { const data = await api("/api/account/sessions/revoke-others", { method: "POST", body: "{}" }); await loadSessions(); notify("ok", data.revoked ? `Signed out ${data.revoked} other device${data.revoked === 1 ? "" : "s"}.` : "No other devices were signed in."); }
    catch (error) { notify("error", error.message); }
    finally { setSessionBusy(""); }
  }

  const others = useMemo(() => (sessions || []).filter((item) => !item.current).length, [sessions]);

  return (
    <>
      <Card title="Password" description="Use at least 8 characters. Changing it signs out your other devices.">
        <form className="settings-form" onSubmit={changePassword}>
          <label><span>Current password</span><input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required /></label>
          <div className="settings-grid2">
            <label><span>New password</span><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength={8} required /></label>
            <label><span>Confirm new password</span><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={8} required aria-invalid={Boolean(mismatch)} />{mismatch && <em className="settings-field-error">Passwords do not match.</em>}</label>
          </div>
          <div className="settings-actions"><button className="btn btn-cream" disabled={busy || Boolean(mismatch) || !currentPassword || newPassword.length < 8}>{busy ? "Updating…" : "Change password"}</button></div>
        </form>
      </Card>

      <Card title="Signed-in devices" description="Devices that are currently signed in to your account.">
        {sessions === null && <p className="settings-muted">Loading devices…</p>}
        {sessions && sessions.length === 0 && <p className="settings-muted">No active devices found.</p>}
        {sessions && sessions.length > 0 && (
          <ul className="settings-sessions">
            {sessions.map((item) => (
              <li key={item.id}>
                <div className="settings-sessions__icon" aria-hidden="true">{/Android|iPhone|iOS/.test(item.userAgent || "") ? "▯" : "▭"}</div>
                <div className="settings-sessions__copy"><strong>{describeDevice(item.userAgent)}{item.current && <span className="settings-badge">This device</span>}</strong><small>Last active {dateTimeFmt(item.lastSeenAt || item.createdAt)} · Signed in {dateFmt(item.createdAt)}</small></div>
                {!item.current && <button type="button" className="btn btn-ghost" disabled={Boolean(sessionBusy)} onClick={() => revoke(item.id)}>{sessionBusy === item.id ? "…" : "Sign out"}</button>}
              </li>
            ))}
          </ul>
        )}
        <div className="settings-actions"><button type="button" className="btn btn-ghost" disabled={!others || Boolean(sessionBusy)} onClick={revokeOthers}>{sessionBusy === "all" ? "Signing out…" : "Sign out all other devices"}</button></div>
      </Card>

      <Card title="Alerts" description="Be told when something important changes on your account.">
        <Row title="Security email alerts" description="Email me when my password changes or other devices are signed out.">
          <Switch label="Security email alerts" checked={prefs.securityAlerts !== false} disabled={savingKey === "securityAlerts"} onChange={(value) => savePref("securityAlerts", value)} />
        </Row>
      </Card>
    </>
  );
}

function PrivacyTab({ user, prefs, savePref, savingKey, notify, onDeleted }) {
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function exportData() {
    setExporting(true);
    try {
      const response = await fetch("/api/account/export", { credentials: "include" });
      if (!response.ok) throw new Error("Could not prepare your data export.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `voxora-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
      notify("ok", "Your data export has been downloaded.");
    } catch (error) { notify("error", error.message); }
    finally { setExporting(false); }
  }

  return (
    <>
      <Card title="Communication" description="Choose what Voxora may email you.">
        <Row title="Product updates & tips" description="Occasional emails about new features. Off by default.">
          <Switch label="Product updates and tips" checked={Boolean(prefs.productUpdates)} disabled={savingKey === "productUpdates"} onChange={(value) => savePref("productUpdates", value)} />
        </Row>
        <Row title="Account & billing emails" description="Receipts, payment problems and verification messages are always sent."><span className="settings-badge settings-badge--muted">Always on</span></Row>
      </Card>

      <Card title="Legal & consent" description="What you agreed to when creating your account.">
        <Row title="Terms & Conditions" description={user.termsAcceptedAt ? `Accepted on ${dateFmt(user.termsAcceptedAt)}${user.termsVersion ? ` (version ${user.termsVersion})` : ""}.` : "No acceptance on record."}><Link className="settings-link" to="/terms">Read terms</Link></Row>
        <Row title="Age confirmation" description={user.adultConfirmedAt ? `Confirmed 18+ on ${dateFmt(user.adultConfirmedAt)}.` : "No confirmation on record."}><Link className="settings-link" to="/privacy">Privacy policy</Link></Row>
        <Row title="Refund policy" description="How cancellations and refunds work."><Link className="settings-link" to="/refund-policy">Read policy</Link></Row>
      </Card>

      <Card title="Your data" description="Take a copy of your information with you.">
        <Row title="Download my data" description="A JSON file with your account, preferences, projects, voice profile details and subscription. Generated media files are not included.">
          <button type="button" className="btn btn-ghost" onClick={exportData} disabled={exporting}>{exporting ? "Preparing…" : "Download data"}</button>
        </Row>
      </Card>

      <Card title="Delete account" description="Request deletion of your Voxora account and associated application data." tone="danger">
        <Row title="Delete my account" description="Deletion removes your account and associated application records and attempts to remove stored project media and cloned voices. Backups and external services may retain information under their own retention schedules. Cancel active subscriptions first.">
          <button type="button" className="btn settings-danger-btn" onClick={() => setDeleteOpen(true)}>Delete account…</button>
        </Row>
      </Card>

      {deleteOpen && <DeleteDialog onClose={() => setDeleteOpen(false)} onDeleted={onDeleted} />}
    </>
  );
}

function DeleteDialog({ onClose, onDeleted }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", onKey); };
  }, [busy, onClose]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await api("/api/account/delete", { method: "POST", body: JSON.stringify({ password, confirm }) });
      await onDeleted();
    } catch (err) { setError(err.message); setBusy(false); }
  }

  return createPortal(
    <div className="settings-modal" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <form className="settings-modal__card" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" onSubmit={submit}>
        <h2 id="delete-title">Delete your account?</h2>
        <p>This deletes your Voxora account and associated application records. Stored media and cloned voices are removed where supported. Backups or external providers may retain some information according to their retention policies. This action cannot be reversed through Voxora.</p>
        {error && <div className="settings-modal__error" role="alert">{error}</div>}
        <label><span>Your password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required autoFocus /></label>
        <label><span>Type <b>DELETE</b> to confirm</span><input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" placeholder="DELETE" required /></label>
        <div className="settings-actions settings-actions--end">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn settings-danger-btn is-solid" disabled={busy || confirm.trim().toUpperCase() !== "DELETE" || !password}>{busy ? "Deleting…" : "Delete my account"}</button>
        </div>
      </form>
    </div>,
    document.body
  );
}
