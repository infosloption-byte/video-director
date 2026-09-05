import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext.jsx";
import "./PlatformShell.css";

const NAV = [
  { label: "Signals", icon: "⌁", path: "/" },
  { label: "My Research", icon: "▦", path: "/my-research", authOnly: true },
  { label: "About", icon: "ⓘ", path: "/about" },
  { label: "Support", icon: "?", path: "/support" },
  { label: "Account", icon: "◎", path: "/account", bottom: true, authOnly: true },
];

const ICON_PATHS = {
  "→": <path d="M5 12h14M13 6l6 6-6 6" />,
  "+": <path d="M12 5v14M5 12h14" />,
};

export default function PlatformShell({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("helix.platform.sidebar") === "collapsed"; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
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

  const workspaceNav = user && projectId ? [
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

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      navigate("/", { replace: true });
      setSigningOut(false);
    }
  }

  const handleBrandClick = (event) => {
    if (collapsed) {
      event.preventDefault();
      setCollapsed(false);
    }
  };

  const renderNavIcon = (item) => {
    const paths = {
      Signals: <><path d="M4 14c2.2 0 2.2-4 4.5-4s2.3 5 4.5 5 2.2-7 4.5-7" /><circle cx="4" cy="14" r="1" fill="currentColor" stroke="none" /><circle cx="18" cy="8" r="1" fill="currentColor" stroke="none" /></>,
      "My Research": <><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
      About: <><circle cx="12" cy="12" r="8" /><path d="M12 10v6M12 7.5h.01" /></>,
      Support: <><circle cx="12" cy="12" r="8" /><path d="M9.5 9.5a2.6 2.6 0 1 1 4.1 2.1c-1 .7-1.6 1.1-1.6 2.4M12 16.5h.01" /></>,
      Account: <><circle cx="12" cy="8.5" r="3" /><path d="M6.5 19a5.5 5.5 0 0 1 11 0" /></>,
      Research: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4 4" /></>,
      Storyboard: <><rect x="5" y="4" width="14" height="16" rx="2" /><path d="m9 8 2 2-2 2M13 12h3M9 16h7" /></>,
      "Media Library": <><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.3" /><path d="m6 17 4-4 3 3 2-2 3 3" /></>,
      "Advanced Editor": <><path d="m14.5 5.5 4 4L10 18H6v-4zM13 7l4 4" /></>,
      "AI Assistant": <><path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M17.7 6.3l-2.1 2.1M8.4 15.6l-2.1 2.1" /><circle cx="12" cy="12" r="4" /></>,
      Render: <><path d="m9 7 7 5-7 5z" /></>,
      Productivity: <><rect x="5" y="5" width="14" height="14" rx="2" /><path d="M8 9h8M8 12h8M8 15h5" /></>,
    };
    return <svg className="platform-nav__icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[item.label]}</svg>;
  };

  const renderNavItem = (item) => (
    <Link key={item.path} to={item.path} className={`platform-nav__item ${isActive(item.path) ? "is-active" : ""}`} title={collapsed ? item.label : undefined} aria-label={item.label}>
      <span className="platform-nav__icon">{renderNavIcon(item)}</span>
      <span className="platform-nav__label">{item.label}</span>
    </Link>
  );

  const visibleNav = NAV.filter((item) => !item.authOnly || Boolean(user));

  return (
    <div className={`platform-shell ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}>
      <aside className="platform-sidebar" aria-label="Platform navigation">
        <div className="platform-sidebar__top">
          <Link to="/" className="platform-brand" onClick={handleBrandClick} aria-label={collapsed ? "Expand sidebar" : "Helix workspace"} title={collapsed ? "Expand sidebar" : "Helix workspace"}>
            <span className="platform-brand__mark">X</span>
            <span className="platform-brand__name">Helix</span>
          </Link>
          <button type="button" className="platform-collapse" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <span aria-hidden="true">{collapsed ? "›" : "‹"}</span>
          </button>
        </div>

        <nav className="platform-nav">
          <div className="platform-nav__group">
            {visibleNav.filter((item) => !item.bottom).map(renderNavItem)}
          </div>
          {workspaceNav.length > 0 && <div className="platform-nav__section">
            <span className="platform-nav__section-title">Workspace</span>
            {workspaceNav.map(renderNavItem)}
          </div>}
          <div className="platform-nav__group platform-nav__group--bottom">
            {visibleNav.filter((item) => item.bottom).map(renderNavItem)}
          </div>
        </nav>

        <div className="platform-sidebar__footer">
          {user ? (
            <>
              <button type="button" className="platform-user" onClick={() => navigate("/account")} title={collapsed ? userLabel : undefined} disabled={signingOut}>
                <span className="platform-user__avatar">{String(userLabel).charAt(0).toUpperCase()}</span>
                <span className="platform-user__copy"><strong>{userLabel}</strong><small>Account</small></span>
              </button>
              <div className="platform-footer-actions">
                <button type="button" onClick={toggleTheme} disabled={signingOut} title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
                  <span aria-hidden="true">{theme === "dark" ? "☼" : "☾"}</span><span className="platform-nav__label">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
                </button>
                <button type="button" className="platform-signout" onClick={handleSignOut} disabled={signingOut} title={signingOut ? "Signing out…" : "Sign out"} aria-label={signingOut ? "Signing out" : "Sign out"} aria-busy={signingOut}>
                  <span className={signingOut ? "platform-signout__spinner" : "platform-signout__icon"} aria-hidden="true">{signingOut ? "" : "↪"}</span><span className="platform-nav__label">{signingOut ? "Signing out…" : "Sign out"}</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="platform-auth-actions">
                <Link to="/signin" className="platform-auth-action platform-auth-actions__primary"><span className="platform-auth-action__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 5h6v14h-6M5 12h10M11 8l4 4-4 4" /></svg></span><span>Sign in</span></Link>
                <Link to="/signup" className="platform-auth-action platform-auth-actions__secondary"><span className="platform-auth-action__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3" /><path d="M6.5 19a5.5 5.5 0 0 1 11 0M19 5v6M16 8h6" /></svg></span><span>Sign up</span></Link>
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
