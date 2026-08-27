import { IconCheck, IconArrowRight } from "./Icons";
import "./FrameworkPanel.css";

export default function FrameworkPanel({ frameworks, activeKey, onContinue }) {
  const active = frameworks.find((f) => f.key === activeKey) ?? frameworks[0];

  return (
    <div className="fw-panel">
      <p className="fw-panel__intro">
        Helix scanned this signal against every narrative it knows and matched it to the
        framework below. You can keep it or pick a different angle.
      </p>

      <div className="fw-grid">
        {frameworks.map((f) => (
          <div key={f.key} className={`fw-card ${f.key === activeKey ? "is-selected" : ""}`}>
            {f.key === activeKey && (
              <span className="fw-card__badge">
                <IconCheck /> Matched
              </span>
            )}
            <h3 className="fw-card__name">{f.name}</h3>
            <p className="fw-card__subtitle">{f.subtitle}</p>
            <p className="fw-card__desc">{f.description}</p>
          </div>
        ))}
      </div>

      <div className="fw-detail">
        <h4 className="fw-detail__title">
          Why <span className="fw-detail__name">{active.name}</span> fits this signal
        </h4>
        <dl className="fw-detail__list">
          <div className="fw-detail__row">
            <dt className="mono-label">HOOK STYLE</dt>
            <dd>{active.hookStyle}</dd>
          </div>
          <div className="fw-detail__row">
            <dt className="mono-label">PACE</dt>
            <dd>{active.pace}</dd>
          </div>
          <div className="fw-detail__row">
            <dt className="mono-label">BEST FOR</dt>
            <dd>{active.bestFor}</dd>
          </div>
        </dl>
      </div>

      <div className="fw-panel__actions">
        <button className="btn btn-cream" onClick={onContinue}>
          Continue to storyboard <IconArrowRight className="btn-icon" />
        </button>
      </div>
    </div>
  );
}
