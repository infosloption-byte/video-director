import { Link } from "react-router-dom";
import "./LegalFooter.css";

export default function LegalFooter() {
  return <footer className="legal-footer" aria-label="Legal and support links">
    <div className="container legal-footer__inner">
      <div className="legal-footer__brand"><Link to="/">V / VOXORA</Link><small>Research. Direct. Create. · A product of <a href="https://sloptions.xyz" target="_blank" rel="noopener noreferrer">SL Options ↗</a></small></div>
      <nav aria-label="Policies"><Link to="/privacy">Privacy Policy</Link><Link to="/terms">Terms &amp; Conditions</Link><Link to="/refund-policy">Refund Policy</Link></nav>
      <span className="legal-footer__copyright">© {new Date().getFullYear()} SL Options · BR No. 261006017</span>
    </div>
  </footer>;
}
