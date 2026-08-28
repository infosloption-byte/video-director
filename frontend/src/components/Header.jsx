import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Header.css";

export default function Header({ right }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, status, signOut } = useAuth();
  const showResearchLink = !["/", "/my-research"].includes(location.pathname);

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <header className="hx-header">
      <div className="container hx-header__inner">
        <Link to="/" className="hx-logo">
          <span className="hx-logo__mark">X</span>
          <span className="hx-logo__word">Helix</span>
        </Link>
        <div className="hx-header__right">
          {showResearchLink && <Link to="/my-research" className="btn btn-ghost hx-header__research-link">My Research</Link>}
          {status === "ready" && user ? <><span className="hx-header__user">{user.displayName || user.email}</span><button type="button" className="btn btn-ghost" onClick={handleSignOut}>Sign out</button></> : <><Link to="/signin" className="btn btn-ghost">Sign in</Link><Link to="/signup" className="btn btn-cream">Create account</Link></>}
          {right}
        </div>
      </div>
    </header>
  );
}
