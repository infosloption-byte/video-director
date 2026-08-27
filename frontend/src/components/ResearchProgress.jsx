import { IconArrowLeft, IconCheck } from "./Icons";
import "./ResearchProgress.css";

const STEPS = [
  ["reading", "Reading the source", "Extracting the selected signal and source content."],
  ["cross_checking", "Cross-checking claims", "Comparing the signal with trusted supporting sources."],
  ["drafting", "Drafting the research brief", "Turning verified evidence into a concise creative brief."],
  ["ready", "Research brief ready", "The evidence-backed brief is ready for guided setup."],
];

const STATUS_INDEX = {
  queued: -1,
  reading: 0,
  cross_checking: 1,
  drafting: 2,
  ready: 3,
  error: -1,
};

export default function ResearchProgress({ status, progress = 0, stageLabel, stageDetail, error, onBack }) {
  const currentIndex = STATUS_INDEX[status] ?? 0;
  const safeProgress = Math.min(100, Math.max(0, Number(progress) || 0));

  return (
    <section className="research-progress" aria-live="polite">
      <button className="btn btn-ghost research-progress__back" onClick={onBack}>
        <IconArrowLeft className="btn-icon" /> Back to signals
      </button>
      <p className="eyebrow">Research stage</p>
      <div className="research-progress__title-row">
        <div>
          <h1>Building the research brief.</h1>
          <p className="research-progress__lead">Helix is checking the selected signal against trusted sources before recommending how to direct it.</p>
        </div>
        <div className="research-progress__percent" aria-label={`${safeProgress}% complete`}>
          <strong>{safeProgress}%</strong>
          <span>complete</span>
        </div>
      </div>

      <div className="research-progress__bar" aria-hidden="true">
        <span style={{ width: `${safeProgress}%` }} />
      </div>

      <div className="research-progress__current" aria-live="polite">
        <span className="research-progress__spinner" />
        <div>
          <strong>{stageLabel || "Preparing research"}</strong>
          <span>{stageDetail || "Helix is preparing the evidence pipeline."}</span>
        </div>
      </div>

      <div className="research-progress__steps">
        {STEPS.map(([key, label, detail], stepIndex) => {
          const complete = status === "ready" || (currentIndex >= 0 && stepIndex < currentIndex) || (status === "error" && stepIndex < currentIndex);
          const current = status !== "error" && ((currentIndex === stepIndex) || (status === "queued" && stepIndex === 0));
          return (
            <div className={`research-progress__step ${complete ? "is-complete" : ""} ${current ? "is-current" : ""} ${status === "error" && stepIndex === currentIndex ? "is-error" : ""}`} key={key}>
              <span className="research-progress__marker">{complete ? <IconCheck /> : String(stepIndex + 1).padStart(2, "0")}</span>
              <div className="research-progress__step-copy">
                <span>{label}</span>
                {current && <small>{detail}</small>}
              </div>
              {current && status !== "error" && <span className="research-progress__pulse" aria-hidden="true" />}
            </div>
          );
        })}
      </div>

      {error && <div className="research-progress__error"><strong>Research couldn't finish.</strong><span>{error}</span><button className="btn btn-ghost" onClick={onBack}>Choose another signal</button></div>}
    </section>
  );
}
