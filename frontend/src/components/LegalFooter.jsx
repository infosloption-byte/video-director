import { Link } from "react-router-dom";
import "./LegalFooter.css";

export default function LegalFooter() {
  return <footer className="legal-footer" aria-label="Site footer">
    <div className="container legal-footer__inner">
      <div className="legal-footer__brand">
        <Link to="/" className="legal-footer__logo"><span aria-hidden="true">V</span>Voxora</Link>
        <p>Research. Direct. Create.</p>
        <small>A product of <a href="https://sloptions.xyz" target="_blank" rel="noopener noreferrer">SL Options ↗</a></small>
      </div>
      <nav aria-label="Product" className="legal-footer__col">
        <span className="legal-footer__heading">Product</span>
        <Link to="/signals">Signals</Link>
        <Link to="/#features">Features</Link>
        <Link to="/#how-it-works">How it works</Link>
        <Link to="/#pricing">Pricing</Link>
      </nav>
      <nav aria-label="Policies" className="legal-footer__col">
        <span className="legal-footer__heading">Legal</span>
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms &amp; Conditions</Link>
        <Link to="/refund-policy">Refund Policy</Link>
      </nav>
      <div className="legal-footer__bottom">
        <span>© {new Date().getFullYear()} SL Options · BR No. 261006017</span>
        <span>Sri Lanka</span>
      </div>
    </div>
  </footer>;
}
