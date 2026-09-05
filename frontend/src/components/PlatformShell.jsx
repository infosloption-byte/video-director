import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext.jsx";
import "./PlatformShell.css";

const NAV = [
  { label: "Signals", icon: "signals", path: "/" },
  { label: "My Research", icon: "research", path: "/my-research", authOnly: true },
  { label: "About", icon: "about", path: "/about" },
  { label: "Support", icon: "support", path: "/support" },
  { label: "Account", icon: "account", path: "/account", bottom: true, authOnly: true },
];

function NavIcon({ name }) {
  const paths = {
    signals: <><path d="M4 12h4l2-7 4 14 2-7h4" /></>,
    research: <><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    about: <><circle cx="12" cy="12" r="8" /><path d="M12 11v5M12 8h.01" /></>,
    support: <><path d="M5 7.5A3.5 3.5 0 0 1 8.5 4h7A3.5 3.5 0 0 1 19 7.5v4A3.5 3.5 0 0 1 15.5 15H12l-3.5 3v-3A3.5 3.5 0 0 1 5 11.5z" /><path d="M9 9.5h6M9 12h4" /></>,
    account: <><circle cx="12" cy="8" r="3" /><path d="M6 20a6 6 0 0 1 12 0" /></>,
    workspace: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
    storyboard: <><rect x="4" y="5" width="6" height="6" rx="1" /><rect x="14" y="5" width="6" height="6" rx="1" /><rect x="4" y="13" width="6" height="6" rx="1" /><rect x="14" y="13" width="6" height="6" rx="1" /></>,
    media: <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" /><circle cx="9" cy="10" r="1.5" /><path d="m5 17 5-5 3 3 2-2 5 5" /></>,
    editor: <><path d="m14.5 5.5 4 4L9 19H5v-4z" /><path d="m13 7 4 4" /></>,
    ai: <><path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M17.7 6.3l-2.1 2.1M8.4 15.6l-2.1 2.1" /><circle cx="12" cy="12" r="4" /></>,
    render: <><path d="m8 5 10 7-10 7z" /></>,
    productivity: <><rect x="5" y="5" width="14" height="14" rx="2" /><path d="M9 9h6M9 12h6M9 15h4" /></>,
  };
  return <svg className="platform-nav__icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.workspace}</svg>;
}

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
    { label: "Research", icon: "workspace", path: `/research/${projectId}` },
    { label: "Storyboard", icon: "storyboard", path: `/storyboard/${projectId}` },
    { label: "Media Library", icon: "media", path: `/media/${projectId}` },
    { label: "Advanced Editor", icon: "editor", path: `/editor/${projectId}` },
    ...(editorId ? [
      { label: "AI Assistant", icon: "ai", path: `/editor/${editorId}/ai` },
      { label: "Render", icon: "render", path: `/editor/${editorId}/render` },
      { label: "Productivity", icon: "productivity", path: `/editor/${editorId}/productivity` },
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

  const renderNavItem = (item) => (
    <Link key={item.path} to={item.path} className={`platform-nav__item ${isActive(item.path) ? "is-active" : ""}`} title={collapsed ? item.label : undefined} aria-label={item.label}>
      <span className="platform-nav__icon" aria-hidden="true"><NavIcon name={item.icon} /></span>
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
                  <span className={signingOut ? "platform-signout__spinner" : ""} aria-hidden="true">{signingOut ? "" : "↪"}</span><span className="platform-nav__label">{signingOut ? "Signing out…" : "Sign out"}</span>
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
