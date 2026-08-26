import { IconArrowLeft, IconArrowRight } from "./Icons";
import "./PreviewPanel.css";

export default function PreviewPanel({ board, activeStep, onSelectStep, onBack, onPublish }) {
  const totalSeconds = board.steps.reduce((sum, s) => sum + parseFloat(s.time), 0);

  return (
    <div className="pv-panel">
      <div className="pv-panel__summary">
        <div className="pv-panel__stat">
          <span className="mono-label">RUNTIME</span>
          <span className="pv-panel__stat-value">{board.duration}</span>
        </div>
        <div className="pv-panel__stat">
          <span className="mono-label">CUTS</span>
          <span className="pv-panel__stat-value">{board.cuts}</span>
        </div>
        <div className="pv-panel__stat">
          <span className="mono-label">FRAMEWORK</span>
          <span className="pv-panel__stat-value">{board.frameworkName}</span>
        </div>
        <div className="pv-panel__stat">
          <span className="mono-label">SCRIPTED TIME</span>
          <span className="pv-panel__stat-value">{totalSeconds.toFixed(1)}s</span>
        </div>
      </div>

      <h3 className="pv-panel__heading">Full script</h3>
      <ol className="pv-transcript">
        {board.steps.map((step, i) => (
          <li
            key={step.n}
            className={`pv-transcript__row ${activeStep === i ? "is-active" : ""}`}
            onClick={() => onSelectStep(i)}
          >
            <span className="mono-label pv-transcript__n">{step.n}</span>
            <div className="pv-transcript__swatch" style={{ background: step.thumb }} />
            <div className="pv-transcript__text">
              <p className="pv-transcript__title">
                {step.title} <span className="mono-label pv-transcript__time">{step.time}</span>
              </p>
              <p className="pv-transcript__line">{step.line}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="pv-panel__notice">
        Ready to publish. Captions render upper-middle in the 9:16 safe zone across all {board.cuts} cuts.
      </div>

      <div className="hx-board__actions">
        <button className="btn btn-ghost" onClick={onBack}>
          <IconArrowLeft className="btn-icon" /> Back to storyboard
        </button>
        <button className="btn btn-cream" onClick={onPublish}>
          Publish pack <IconArrowRight className="btn-icon" />
        </button>
      </div>
    </div>
  );
}
