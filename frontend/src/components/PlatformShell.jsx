import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext.jsx";
import "./PlatformShell.css";

const NAV = [
  { label: "Signals", icon: "⌁", path: "/" },
  { label: "My Research", icon: "▦", path: "/my-research" },
  { label: "Account", icon: "◎", path: "/account", bottom: true },
];

export default function PlatformShell({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("helix.platform.sidebar") === "collapsed"; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const projectId = useMemo(() => location.pathname.match(/^(?:\/research|\/storyboard|\/media)\/([^/]+)/)?.[1] || location.pathname.match(/^\/editor\/([^/]+)/)?.[1] || "", [location.pathname]);
  const editorId = location.pathname.match(/^\/editor\/([^/]+)/)?.[1] || "";
  const userLabel = user?.displayName || user?.email || "Account";

  useEffect(() => {
    try { localStorage.setItem("helix.platform.sidebar", collapsed ? "collapsed" : "expanded"); } catch { /* storage is optional */ }
  }, [collapsed]);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKeyDown = (event) => { if (event.key === "Escape") setMobileOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  const workspaceNav = projectId ? [
    { label: "Research", icon: "◌", path: `/research/${projectId}` },
    { label: "Storyboard", icon: "▤", path: `/storyboard/${projectId}` },
    { label: "Media Library", icon: "▧", path: `/media/${projectId}` },
    { label: "Advanced Editor", icon: "✦", path: `/editor/${projectId}` },
    ...(editorId ? [
      { label: "AI Assistant", icon: "✧", path: `/editor/${editorId}/ai` },
      { label: "Render", icon: "▶", path: `/editor/${editorId}/render` },
      { label: "Productivity", icon: "◫", path: `/editor/${editorId}/productivity` },
    ] : []),
  ] : [];

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  function handleSignOut() {
    void signOut();
    navigate("/", { replace: true });
  }

  const renderNavItem = (item) => (
    <Link key={item.path} to={item.path} className={`platform-nav__item ${isActive(item.path) ? "is-active" : ""}`} title={collapsed ? item.label : undefined} aria-label={item.label}>
      <span className="platform-nav__icon" aria-hidden="true">{item.icon}</span>
      <span className="platform-nav__label">{item.label}</span>
    </Link>
  );

  return (
    <div className={`platform-shell ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}>
      <aside className="platform-sidebar" aria-label="Platform navigation">
        <div className="platform-sidebar__top">
          <Link to="/" className="platform-brand" aria-label="Helix workspace">
            <span className="platform-brand__mark">X</span>
            <span className="platform-brand__name">Helix</span>
          </Link>
          <button type="button" className="platform-collapse" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <span aria-hidden="true">{collapsed ? "›" : "‹"}</span>
          </button>
        </div>

        <nav className="platform-nav">
          <div className="platform-nav__group">
            {NAV.filter((item) => !item.bottom).map(renderNavItem)}
          </div>
          {workspaceNav.length > 0 && <div className="platform-nav__section">
            <span className="platform-nav__section-title">Workspace</span>
            {workspaceNav.map(renderNavItem)}
          </div>}
          <div className="platform-nav__group platform-nav__group--bottom">
            {NAV.filter((item) => item.bottom).map(renderNavItem)}
          </div>
        </nav>

        <div className="platform-sidebar__footer">
          {user ? (
            <>
              <button type="button" className="platform-user" onClick={() => navigate("/account")} title={collapsed ? userLabel : undefined}>
                <span className="platform-user__avatar">{String(userLabel).charAt(0).toUpperCase()}</span>
                <span className="platform-user__copy"><strong>{userLabel}</strong><small>Account</small></span>
              </button>
              <div className="platform-footer-actions">
                <button type="button" onClick={toggleTheme} title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
                  <span aria-hidden="true">{theme === "dark" ? "☼" : "☾"}</span><span className="platform-nav__label">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
                </button>
                <button type="button" onClick={handleSignOut} title="Sign out" aria-label="Sign out">
                  <span aria-hidden="true">↪</span><span className="platform-nav__label">Sign out</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="platform-auth-actions">
                <Link to="/signin" className="platform-auth-actions__primary">Sign in</Link>
                <Link to="/signup" className="platform-auth-actions__secondary">Sign up</Link>
              </div>
              <div className="platform-footer-actions">
                <button type="button" onClick={toggleTheme} title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
                  <span aria-hidden="true">{theme === "dark" ? "☼" : "☾"}</span><span className="platform-nav__label">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      {mobileOpen && <button type="button" className="platform-mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <div className="platform-main">
        <header className="platform-topbar">
          <button type="button" className="platform-mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><span /><span /><span /></button>
          <div className="platform-breadcrumb"><span className="platform-breadcrumb__product">Helix</span>{projectId && <><span>/</span><span>{location.pathname.includes("/editor") ? "Editor" : "Project"}</span></>}</div>
          <div className="platform-topbar__actions"><button type="button" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">{theme === "dark" ? "☼" : "☾"}</button></div>
        </header>
        <main className="platform-content">{children}</main>
      </div>
    </div>
  );
}
