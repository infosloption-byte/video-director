import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext.jsx";
import { useProjects } from "../context/useProjects.js";
import "./PlatformShell.css";

const NAV = [
  { label: "Signals", icon: "Signals", path: "/" },
  { label: "My Research", icon: "My Research", path: "/my-research", authOnly: true },
];

export default function PlatformShell({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { projects } = useProjects();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("helix.platform.sidebar") === "collapsed"; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const accountMenuRef = useRef(null);
  const projectId = useMemo(() => location.pathname.match(/^(?:\/research|\/research-conversation|\/storyboard|\/media)\/([^/]+)/)?.[1] || location.pathname.match(/^\/editor\/([^/]+)/)?.[1] || "", [location.pathname]);
  const userLabel = user?.displayName || user?.email || "Account";
  const recentProjects = useMemo(() => projects.slice(0, 5), [projects]);

  useEffect(() => {
    try { localStorage.setItem("helix.platform.sidebar", collapsed ? "collapsed" : "expanded"); } catch { /* storage is optional */ }
  }, [collapsed]);

  useEffect(() => { setMobileOpen(false); setAccountMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKeyDown = (event) => { if (event.key === "Escape") setMobileOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    if (!accountMenuOpen) return undefined;
    const onPointerDown = (event) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) setAccountMenuOpen(false);
    };
    const onKeyDown = (event) => { if (event.key === "Escape") setAccountMenuOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountMenuOpen]);

  const workspaceNav = user && projectId ? [
    { label: "Research", icon: "Research", path: `/research/${projectId}` },
    { label: "Storyboard", icon: "Storyboard", path: `/storyboard/${projectId}` },
    { label: "Advanced Editor", icon: "Advanced Editor", path: `/editor/${projectId}` },
  ] : recentProjects.map((project) => ({
    label: project.title || "Untitled research",
    icon: "Research",
    path: `/research/${project.id}`,
  }));

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try { await signOut(); } finally {
      setAccountMenuOpen(false);
      navigate("/", { replace: true });
      setSigningOut(false);
    }
  }

  const handleBrandClick = (event) => {
    if (collapsed) { event.preventDefault(); setCollapsed(false); }
  };

  const renderNavIcon = (item) => {
    const paths = {
      Signals: <><path d="M4 14c2.2 0 2.2-4 4.5-4s2.3 5 4.5 5 2.2-7 4.5-7" /><circle cx="4" cy="14" r="1" fill="currentColor" stroke="none" /><circle cx="18" cy="8" r="1" fill="currentColor" stroke="none" /></>,
      "My Research": <><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
      Research: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4 4" /></>,
      Storyboard: <><rect x="5" y="4" width="14" height="16" rx="2" /><path d="m9 8 2 2-2 2M13 12h3M9 16h7" /></>,
      "Advanced Editor": <><path d="m14.5 5.5 4 4L10 18H6v-4zM13 7l4 4" /></>,
      About: <><circle cx="12" cy="12" r="8" /><path d="M12 10v6M12 7.5h.01" /></>,
      Support: <><circle cx="12" cy="12" r="8" /><path d="M9.5 9.5a2.6 2.6 0 1 1 4.1 2.1c-1 .7-1.6 1.1-1.6 2.4M12 16.5h.01" /></>,
      Settings: <><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" /><path d="m19 13.2 1.1.8-1.5 2.6-1.3-.5a7 7 0 0 1-1.8 1.1l-.2 1.4h-3l-.2-1.4a7 7 0 0 1-1.8-1.1l-1.3.5-1.5-2.6 1.1-.8a7 7 0 0 1 0-2.4l-1.1-.8 1.5-2.6 1.3.5a7 7 0 0 1 1.8-1.1l.2-1.4h3l.2 1.4a7 7 0 0 1 1.8 1.1l1.3-.5 1.5 2.6-1.1.8a7 7 0 0 1 0 2.4Z" /></>,
    };
    return <svg className="platform-nav__icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[item.icon] || paths.Research}</svg>;
  };

  const renderNavItem = (item) => <Link key={item.path} to={item.path} className={`platform-nav__item ${isActive(item.path) ? "is-active" : ""}`} title={collapsed ? item.label : undefined} aria-label={item.label}>
    <span className="platform-nav__icon">{renderNavIcon(item)}</span><span className="platform-nav__label">{item.label}</span>
  </Link>;

  const visibleNav = NAV.filter((item) => !item.authOnly || Boolean(user));

  return <div className={`platform-shell ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}>
    <aside className="platform-sidebar" aria-label="Platform navigation">
      <div className="platform-sidebar__top">
        <Link to="/" className="platform-brand" onClick={handleBrandClick} aria-label={collapsed ? "Expand sidebar" : "Helix workspace"} title={collapsed ? "Expand sidebar" : "Helix workspace"}><span className="platform-brand__mark">X</span><span className="platform-brand__name">Helix</span></Link>
        <button type="button" className="platform-collapse" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"><span aria-hidden="true">{collapsed ? "›" : "‹"}</span></button>
      </div>
      <nav className="platform-nav">
        <div className="platform-nav__group">{visibleNav.map(renderNavItem)}</div>
        {user && <div className="platform-nav__section">
          <span className="platform-nav__section-title">{projectId ? "Workspace" : "Recent research"}</span>
          {workspaceNav.length > 0 ? workspaceNav.map(renderNavItem) : <Link to="/my-research" className="platform-nav__item"><span className="platform-nav__icon">{renderNavIcon({ icon: "My Research" })}</span><span className="platform-nav__label">Open My Research</span></Link>}
        </div>}
      </nav>
      <div className="platform-sidebar__footer">
        {user ? <div className="platform-account" ref={accountMenuRef}>
          {accountMenuOpen && <div className="platform-account-menu" role="menu" aria-label="Account menu">
            <Link to="/about" className="platform-account-menu__item" role="menuitem"><span className="platform-account-menu__icon">{renderNavIcon({ label: "About", icon: "About" })}</span><span>About</span></Link>
            <Link to="/support" className="platform-account-menu__item" role="menuitem"><span className="platform-account-menu__icon">{renderNavIcon({ label: "Support", icon: "Support" })}</span><span>Support</span></Link>
            <Link to="/account" className="platform-account-menu__item" role="menuitem"><span className="platform-account-menu__icon">{renderNavIcon({ label: "Settings", icon: "Settings" })}</span><span>Settings</span></Link>
            <div className="platform-account-menu__divider" />
            <button type="button" className="platform-account-menu__item platform-account-menu__item--danger" onClick={handleSignOut} disabled={signingOut} role="menuitem"><span className={signingOut ? "platform-signout__spinner" : "platform-account-menu__icon"} aria-hidden="true">{signingOut ? "" : "↪"}</span><span>{signingOut ? "Signing out…" : "Sign Out"}</span></button>
          </div>}
          <button type="button" className={`platform-user ${accountMenuOpen ? "is-open" : ""}`} onClick={() => setAccountMenuOpen((value) => !value)} title={collapsed ? userLabel : undefined} disabled={signingOut} aria-expanded={accountMenuOpen} aria-haspopup="menu"><span className="platform-user__avatar">{String(userLabel).charAt(0).toUpperCase()}</span><span className="platform-user__copy"><strong>{userLabel}</strong><small>Account</small></span><span className="platform-user__chevron" aria-hidden="true">⌃</span></button>
        </div> : <div className="platform-auth-actions"><Link to="/signin" className="platform-auth-action platform-auth-actions__primary"><span className="platform-auth-action__icon">→</span><span>Sign in</span></Link><Link to="/signup" className="platform-auth-action platform-auth-actions__secondary"><span className="platform-auth-action__icon">+</span><span>Sign up</span></Link></div>}
      </div>
    </aside>
    {mobileOpen && <button type="button" className="platform-mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <div className="platform-main">
      <header className="platform-topbar"><button type="button" className="platform-mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><span /><span /><span /></button><div className="platform-breadcrumb"><span className="platform-breadcrumb__product">Helix</span>{projectId && <><span>/</span><span>{location.pathname.includes("/editor") ? "Editor" : "Project"}</span></>}</div><div className="platform-topbar__actions"><button type="button" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">{theme === "dark" ? "☼" : "☾"}</button></div></header>
      <main className="platform-content">{children}</main>
    </div>
  </div>;
}
