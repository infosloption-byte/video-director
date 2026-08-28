import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Header.css";

export default function Header({ right }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, status, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const showResearchLink = location.pathname !== "/my-research";

  useEffect(() => {
    if (!menuOpen) return undefined;
    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
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

  async function handleSignOut() {
    setMenuOpen(false);
    await signOut();
    navigate("/", { replace: true });
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
              <Link to="/my-research" className="btn btn-ghost hx-header__research-link">
                <span aria-hidden="true">▦</span> My Research
              </Link>
            )}
            {authenticated ? (
              <>
                <span className="hx-header__user" title={userLabel}>{userLabel}</span>
                {right}
                <div className="hx-header__menu" ref={menuRef}>
                  <button type="button" className="btn btn-ghost hx-header__menu-trigger" aria-label="Open account menu" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>•••</button>
                  {menuOpen && (
                    <div className="hx-header__dropdown" role="menu">
                      <div className="hx-header__dropdown-user"><strong>{userLabel}</strong><span>{user?.email}</span></div>
                      <Link role="menuitem" to="/my-research" onClick={() => setMenuOpen(false)}>My Research</Link>
                      <Link role="menuitem" to="/account" onClick={() => setMenuOpen(false)}>Account settings</Link>
                      <button role="menuitem" type="button" onClick={handleSignOut}>Sign out</button>
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

        <button type="button" className="hx-header__mobile-trigger" aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          <span /><span /><span />
        </button>
      </div>

      {menuOpen && <div className="hx-header__mobile-menu" ref={menuRef}>
        {authenticated ? (
          <>
            <div className="hx-header__mobile-user">
              <span className="hx-header__mobile-avatar">{String(userLabel).charAt(0).toUpperCase()}</span>
              <div><strong>{userLabel}</strong><span>{user?.email}</span></div>
            </div>
            {showResearchLink && <Link to="/my-research" onClick={() => setMenuOpen(false)}>▦ My Research</Link>}
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
      </div>}
    </header>
  );
}
