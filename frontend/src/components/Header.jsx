import { Link, useLocation } from "react-router-dom";
import "./Header.css";

export default function Header({ right }) {
  const location = useLocation();
  const showResearchLink = location.pathname !== "/my-research";

  return (
    <header className="hx-header">
      <div className="container hx-header__inner">
        <Link to="/" className="hx-logo">
          <span className="hx-logo__mark">X</span>
          <span className="hx-logo__word">Helix</span>
        </Link>
        <div className="hx-header__right">
          {showResearchLink && <Link to="/my-research" className="btn btn-ghost hx-header__research-link">My Research</Link>}
          {right}
        </div>
      </div>
    </header>
  );
}
