import { Link } from "react-router-dom";
import "./Header.css";

export default function Header({ right }) {
  return (
    <header className="hx-header">
      <div className="container hx-header__inner">
        <Link to="/" className="hx-logo">
          <span className="hx-logo__mark">X</span>
          <span className="hx-logo__word">Helix</span>
        </Link>
        <div className="hx-header__right">{right}</div>
      </div>
    </header>
  );
}
