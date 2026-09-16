import "./SessionGate.css";

export default function SessionGate({ label = "Checking your session…" }) {
  return (
    <div className="hx-page">
      <main className="container session-gate" role="status" aria-live="polite">
        <div className="session-gate__mark">
          <span className="session-gate__mark-glyph">X</span>
          <svg className="session-gate__ring" viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="24" r="21" />
          </svg>
        </div>
        <p className="session-gate__label">{label}</p>
        <div className="session-gate__bar"><span /></div>
      </main>
    </div>
  );
}
