import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Header.css";

export default function Header({ right }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, status, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const desktopMenuRef = useRef(null);
  const mobileMenuRef = useRef(null);
  const showResearchLink = location.pathname !== "/my-research";

  useEffect(() => {
    if (!menuOpen) return undefined;
    function handlePointerDown(event) {
      const target = event.target;
      if (!desktopMenuRef.current?.contains(target) && !mobileMenuRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  function handleSignOut() {
    setMenuOpen(false);
    // Navigate immediately so desktop and mobile have the same responsive behavior.
    // The auth context clears the local user state immediately and clears the server
    // session in the background with its own timeout/error handling.
    navigate("/", { replace: true });
    void signOut();
  }

  const authenticated = status === "ready" && Boolean(user);
  const userLabel = user?.displayName || user?.email || "Account";

  return (
    <header className="hx-header">
      <div className="container hx-header__inner">
        <Link to="/" className="hx-logo" onClick={() => setMenuOpen(false)}>
          <span className="hx-logo__mark">X</span>
          <span className="hx-logo__word">Helix</span>
        </Link>

        <div className="hx-header__desktop">
          <div className="hx-header__right">
            {authenticated && showResearchLink && (
              <Link
                to="/my-research"
                className="btn btn-ghost hx-header__compact-action"
                aria-label="Open My Research"
                title="My Research"
              >
                <span className="hx-header__action-icon" aria-hidden="true">▦</span>
                <span className="hx-header__action-label">My Research</span>
              </Link>
            )}
            {authenticated ? (
              <>
                <span className="hx-header__greeting">Hi, {userLabel}</span>
                {right}
                <div className="hx-header__menu" ref={desktopMenuRef}>
                  <button
                    type="button"
                    className="btn btn-ghost hx-header__menu-trigger"
                    aria-label="Open account menu"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((open) => !open)}
                  >
                    •••
                  </button>
                  {menuOpen && (
                    <div className="hx-header__dropdown" role="menu">
                      <div className="hx-header__dropdown-user">
                        <strong>Hi, {userLabel}</strong>
                        <span>{user?.email}</span>
                      </div>
                      <Link role="menuitem" to="/my-research" onClick={() => setMenuOpen(false)}>
                        <span aria-hidden="true">▦</span> My Research
                      </Link>
                      <Link role="menuitem" to="/account" onClick={() => setMenuOpen(false)}>
                        Account settings
                      </Link>
                      <button role="menuitem" type="button" onClick={handleSignOut}>
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                {right}
                <Link to="/signin" className="btn btn-ghost">Sign in</Link>
                <Link to="/signup" className="btn btn-cream">Create account</Link>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          className="hx-header__mobile-trigger"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span /><span /><span />
        </button>
      </div>

      {menuOpen && (
        <div className="hx-header__mobile-menu" ref={mobileMenuRef}>
          {authenticated ? (
            <>
              <div className="hx-header__mobile-user">
                <span className="hx-header__mobile-avatar">{String(userLabel).charAt(0).toUpperCase()}</span>
                <div><strong>Hi, {userLabel}</strong><span>{user?.email}</span></div>
              </div>
              {showResearchLink && <Link to="/my-research" onClick={() => setMenuOpen(false)}><span aria-hidden="true">▦</span> My Research</Link>}
              <Link to="/account" onClick={() => setMenuOpen(false)}>Account settings</Link>
              <div className="hx-header__mobile-actions">{right}</div>
              <button type="button" onClick={handleSignOut}>Sign out</button>
            </>
          ) : (
            <>
              <div className="hx-header__mobile-actions">{right}</div>
              <Link to="/signin" onClick={() => setMenuOpen(false)}>Sign in</Link>
              <Link to="/signup" className="is-primary" onClick={() => setMenuOpen(false)}>Create account</Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
