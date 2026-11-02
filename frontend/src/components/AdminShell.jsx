import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import "./AdminShell.css";

const MENU = [
  { section: "Platform", links: [
    { path: "/admin", label: "Overview", icon: "layout-dashboard" },
    { path: "/admin/users", label: "Users", icon: "users" },
    { path: "/admin/projects", label: "Projects", icon: "folder" },
    { path: "/admin/subscriptions", label: "Subscriptions", icon: "credit-card" },
  ] },
  { section: "Analytics", links: [
    { path: "/admin/analytics", label: "Operations", icon: "layout-dashboard" },
    { path: "/admin/analytics/pipeline", label: "Pipeline Timings", icon: "activity" },
    { path: "/admin/analytics/users", label: "User Usage", icon: "users" },
    { path: "/admin/analytics/costs", label: "Costs & Providers", icon: "credit-card" },
  ] },
  { section: "Management", links: [
    { path: "/admin/plans", label: "Plans & Limits", icon: "sliders" },
    { path: "/admin/master-data", label: "Master Data", icon: "database" },
    { path: "/admin/settings", label: "Platform Settings", icon: "settings" },
    { path: "/admin/integrations", label: "AI Integrations", icon: "cpu" },
    { path: "/admin/model-pool", label: "AI Model Pool", icon: "cpu" },
    { path: "/admin/pipelines", label: "AI Pipelines", icon: "activity" },
  ] },
  { section: "Security", links: [
    { path: "/admin/activity", label: "Activity", icon: "activity" },
    { path: "/admin/audit", label: "Admin Audit", icon: "shield" },
  ] },
];

const PATHS = {
  "layout-dashboard": <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 11a3 3 0 0 0 0-6M18 15a5 5 0 0 1 3 5"/></>,
  folder: <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>,
  "credit-card": <><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19"/></>,
  sliders: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="var(--bg-raised)"/><circle cx="16" cy="17" r="2" fill="var(--bg-raised)"/></>,
  database: <><ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 4 16 4 16 0v-13M4 12c0 4 16 4 16 0"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1m10 10 2.1 2.1m0-14.2L17 7M7 17l-2.1 2.1"/></>,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="10" y="10" width="4" height="4"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/></>,
  activity: <path d="M2 12h4l3-7 5 14 3-7h5"/>,
  shield: <><path d="M12 2 4 5v6c0 5 4 9 8 11 4-2 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/></>,
};
function SideIcon({ name }) {
  return <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{PATHS[name]}</svg>;
}

export default function AdminShell({ children }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem("voxora-admin-sidebar-collapsed") === "true"; }
    catch { return false; }
  });
  useEffect(() => {
    try { window.localStorage.setItem("voxora-admin-sidebar-collapsed", String(collapsed)); }
    catch { /* Persisting the preference is optional. */ }
  }, [collapsed]);
  useEffect(() => { setMobile(false); }, [pathname]);
  useEffect(() => {
    if (!mobile) return undefined;
    function close(event) { if (event.key === "Escape") setMobile(false); }
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mobile]);
  async function logout() {
    await signOut();
    navigate("/signin", { replace: true });
  }
  const display = user?.displayName || user?.email || "Administrator";
  return <div className={"va-shell " + (collapsed ? "is-collapsed" : "")}>
    {mobile && <button className="va-backdrop" type="button" onClick={() => setMobile(false)} aria-label="Close admin navigation"/>}
    <aside className={`va-sidebar ${mobile ? "is-open" : ""} ${collapsed ? "is-collapsed" : ""}`} aria-label="Administration navigation">
      <Link className="va-brand" to="/admin"><span className="va-brand-icon">V</span><span><strong>Voxora</strong><small>Administration</small></span></Link>
      <button type="button" className="va-collapse-btn" aria-label={collapsed ? "Expand admin sidebar" : "Collapse admin sidebar"} aria-expanded={!collapsed}
        title={collapsed ? "Expand navigation" : "Minimize navigation"} onClick={() => setCollapsed(v => !v)}>
        <span aria-hidden="true">{collapsed ? "»" : "«"}</span><span className="va-collapse-label">{collapsed ? "Expand menu" : "Minimize menu"}</span>
      </button>
      <nav className="va-navigation" aria-label="Admin sections">
        {MENU.map(group => <div className="va-group" key={group.section}><span className="va-group-label">{group.section}</span>{group.links.map(link =>
          <Link key={link.path} title={link.label} aria-label={link.label} to={link.path} aria-current={pathname === link.path ? "page" : undefined} className={`va-navlink ${pathname === link.path ? "active" : ""}`}><SideIcon name={link.icon}/><span>{link.label}</span></Link>
        )}</div>)}
      </nav>
      <div className="va-sidebar-bottom">
        <Link className="va-workspace-link" to="/signals" title="Return to Workspace" aria-label="Return to Workspace"><span aria-hidden="true">↗</span><span className="va-workspace-label">Return to Workspace</span></Link>
        <div className="va-identity"><span className="va-avatar">{display.charAt(0).toUpperCase()}</span><span><strong>{display}</strong><small>Platform administrator</small></span></div>
      </div>
    </aside>
    <div className="va-main">
      <header className="va-topbar">
        <div className="va-top-left"><button type="button" className="va-mobile-trigger" onClick={() => setMobile(v => !v)} aria-label="Toggle admin navigation" aria-expanded={mobile}>☰</button><span className="va-top-label">Platform Administration</span></div>
        <div className="va-top-actions"><Link to="/signals" className="va-toplink">Open workspace</Link><button type="button" onClick={toggleTheme} aria-label="Toggle appearance" title="Change theme">{theme === "dark" ? "☼" : "☾"}</button><button type="button" onClick={logout}>Sign out</button></div>
      </header>
      <main className="va-content" id="admin-main">{children}</main>
    </div>
  </div>;
}
