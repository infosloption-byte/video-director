import { useNavigate } from "react-router-dom";
import { IconArrowUpRight } from "./Icons";
import "./SignalCard.css";

export default function SignalCard({ signal, featured = false }) {
  const navigate = useNavigate();
  const hasStoryboard = ["quantum-gps", "solid-state"].includes(signal.id);

  return (
    <article className={`signal-card ${featured ? "signal-card--featured" : ""}`}>
      <div className="signal-card__media" style={{ background: signal.thumb }} aria-hidden="true" />
      <div className="signal-card__body">
        <div className="signal-card__meta">
          <span className="mono-label signal-card__rank">{signal.rank}</span>
          <span className="tag">{signal.category}</span>
          <span className="tag-pct">{signal.pct}</span>
        </div>

        <h3 className="signal-card__title">{signal.title}</h3>
        <p className="signal-card__desc">{signal.description}</p>

        <div className="signal-card__footer">
          <p className="signal-card__why">
            <span className="mono-label">{signal.whyLabel}</span> {signal.why}
          </p>

          <div className="signal-card__actions">
            <span className="signal-card__source">
              {signal.source} <span className="signal-card__dot">·</span> {signal.sourceNote}
            </span>
            <button
              className="btn btn-cream"
              disabled={!hasStoryboard}
              onClick={() => hasStoryboard && navigate(`/storyboard/${signal.id}`)}
            >
              Direct this Reel <IconArrowUpRight className="btn-icon" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
