import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext.jsx";
import "./ui.css";
import "./PublicHeader.css";

const NAV_LINKS = [
  { label: "Signals", to: "/signals", icon: "signals" },
  { label: "Features", to: "/#features", icon: "features" },
  { label: "How it works", to: "/#how-it-works", icon: "flow" },
  { label: "Pricing", to: "/#pricing", icon: "pricing" },
];

function NavIcon({ name }) {
  const paths = {
    signals: <><path d="M3 14c2.2 0 2.2-4 4.5-4s2.3 5 4.5 5 2.2-7 4.5-7 2.3 4 4.5 4" /></>,
    features: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
    flow: <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="12" r="2" /><circle cx="6" cy="18" r="2" /><path d="M8 6h4a4 4 0 0 1 4 4M8 18h4a4 4 0 0 0 4-4" /></>,
    pricing: <><path d="M12 4v16M16 8.5c0-1.7-1.8-2.5-4-2.5s-4 .9-4 2.6 1.6 2.2 4 2.8 4 1.1 4 2.8-1.8 2.8-4 2.8-4-.9-4-2.6" /></>,
    research: <><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    voice: <><rect x="9" y="4" width="6" height="10" rx="3" /><path d="M6 11.5a6 6 0 0 0 12 0M12 18v2.5" /></>,
    account: <><circle cx="12" cy="9" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></>,
    billing: <><rect x="3.5" y="6" width="17" height="12" rx="2" /><path d="M3.5 10.5h17" /></>,
    legal: <><path d="M12 4 5 7v5c0 4 2.8 6.6 7 8 4.2-1.4 7-4 7-8V7z" /></>,
    out: <><path d="M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4M14 8l4 4-4 4M18 12H9" /></>,
  };
  return <svg className="ph-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function ThemeIcon({ theme }) {
  return theme === "dark"
    ? <svg className="ph-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></svg>
    : <svg className="ph-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" /></svg>;
}

/**
 * Top bar for the public marketing + legal pages.
 * Layout: logo | primary links (Signals, Features, How it works, Pricing) | theme, sign in, primary CTA.
 * Collapses to a hamburger panel below 960px so tablets and phones get the same links without crowding.
 */
export default function PublicHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, status, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  // Menus are "open for a specific navigation": any route change gets a new location.key,
  // so they close on their own without a state update inside an effect.
  const [mobileKey, setMobileKey] = useState(null);
  const [accountKey, setAccountKey] = useState(null);
  const mobileOpen = mobileKey === location.key;
  const accountOpen = accountKey === location.key;
  const accountRef = useRef(null);
  const headerRef = useRef(null);
  const authenticated = status === "ready" && Boolean(user);
  const userLabel = user?.displayName || user?.email || "Account";
  const nextTheme = theme === "dark" ? "light" : "dark";

  useEffect(() => {
    if (!mobileOpen && !accountOpen) return undefined;
    const onPointerDown = (event) => {
      if (accountOpen && !accountRef.current?.contains(event.target)) setAccountKey(null);
      if (mobileOpen && !headerRef.current?.contains(event.target)) setMobileKey(null);
    };
    const onKeyDown = (event) => { if (event.key === "Escape") { setMobileKey(null); setAccountKey(null); } };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen, accountOpen]);

  // Leaving the mobile breakpoint should never leave the panel open.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 961px)");
    const onChange = (event) => { if (event.matches) setMobileKey(null); };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  async function handleSignOut() {
    setAccountKey(null);
    setMobileKey(null);
    navigate("/", { replace: true });
    await signOut();
  }

  const isCurrent = (to) => {
    if (to === "/signals") return location.pathname === "/signals";
    const [path, hash] = to.split("#");
    return location.pathname === (path || "/") && location.hash === `#${hash}`;
  };

  const primaryTo = authenticated ? "/my-research" : "/signup";
  const primaryLabel = authenticated ? "Open workspace" : "Create account";

  return (
    <header className="ph" ref={headerRef}>
      <div className="container ph__inner">
        <Link to="/" className="ph__logo" aria-label="Voxora home">
          <span className="ph__logo-mark">V</span>
          <span className="ph__logo-word">Voxora</span>
        </Link>

        <nav className="ph__nav" aria-label="Primary">
          {NAV_LINKS.map((item) => (
            <Link key={item.to} to={item.to} className={`ph__link${isCurrent(item.to) ? " is-current" : ""}`}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ph__actions">
          <button type="button" className="ph__icon-btn" onClick={toggleTheme} aria-label={`Switch to ${nextTheme} theme`} title={`Switch to ${nextTheme} theme`}>
            <ThemeIcon theme={theme} />
          </button>
          {authenticated ? (
            <>
              <Link to={primaryTo} className="btn btn-cream ph__cta">{primaryLabel}</Link>
              <div className="ph__account" ref={accountRef}>
                <button type="button" className="ph__avatar" onClick={() => setAccountKey(accountOpen ? null : location.key)} aria-haspopup="menu" aria-expanded={accountOpen} aria-label="Open account menu" title={userLabel}>
                  {String(userLabel).charAt(0).toUpperCase()}
                </button>
                {accountOpen && (
                  <div className="ph__dropdown" role="menu">
                    <div className="ph__dropdown-user"><strong>{userLabel}</strong>{user?.email && user.email !== userLabel && <span>{user.email}</span>}</div>
                    <Link role="menuitem" to="/my-research"><NavIcon name="research" /> My Research</Link>
                    <Link role="menuitem" to="/voice-profiles"><NavIcon name="voice" /> Voice Profiles</Link>
                    <Link role="menuitem" to="/account"><NavIcon name="account" /> Account settings</Link>
                    <Link role="menuitem" to="/billing"><NavIcon name="billing" /> Subscription &amp; billing</Link>
                    <Link role="menuitem" to="/privacy"><NavIcon name="legal" /> Privacy &amp; legal</Link>
                    <button role="menuitem" type="button" onClick={handleSignOut}><NavIcon name="out" /> Sign out</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link to="/signin" className="ph__signin">Sign in</Link>
              <Link to={primaryTo} className="btn btn-cream ph__cta">{primaryLabel}</Link>
            </>
          )}
        </div>

        <button type="button" className={`ph__burger${mobileOpen ? " is-open" : ""}`} aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={mobileOpen} aria-controls="ph-mobile-panel" onClick={() => setMobileKey(mobileOpen ? null : location.key)}>
          <span /><span /><span />
        </button>
      </div>

      <div id="ph-mobile-panel" className={`ph__panel${mobileOpen ? " is-open" : ""}`} hidden={!mobileOpen}>
        <div className="container ph__panel-inner">
          <nav className="ph__panel-nav" aria-label="Primary mobile">
            {NAV_LINKS.map((item) => (
              <Link key={item.to} to={item.to} className={isCurrent(item.to) ? "is-current" : undefined}>
                <NavIcon name={item.icon} /><span>{item.label}</span>
              </Link>
            ))}
            {authenticated && <>
              <Link to="/my-research"><NavIcon name="research" /><span>My Research</span></Link>
              <Link to="/voice-profiles"><NavIcon name="voice" /><span>Voice Profiles</span></Link>
              <Link to="/account"><NavIcon name="account" /><span>Account settings</span></Link>
              <Link to="/billing"><NavIcon name="billing" /><span>Subscription &amp; billing</span></Link>
            </>}
          </nav>
          <div className="ph__panel-actions">
            <button type="button" className="ph__panel-theme" onClick={toggleTheme}><ThemeIcon theme={theme} /> {theme === "dark" ? "Light theme" : "Dark theme"}</button>
            {authenticated ? (
              <>
                <Link to={primaryTo} className="btn btn-cream">{primaryLabel}</Link>
                <button type="button" className="ph__panel-signout" onClick={handleSignOut}>Sign out</button>
              </>
            ) : (
              <>
                <Link to="/signin" className="btn btn-ghost">Sign in</Link>
                <Link to={primaryTo} className="btn btn-cream">{primaryLabel}</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
