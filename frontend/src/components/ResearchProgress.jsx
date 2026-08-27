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

function errorStepIndex(progress) {
  const value = Number(progress) || 0;
  if (value >= 52) return 2;
  if (value >= 26) return 1;
  return 0;
}

export default function ResearchProgress({ status, progress = 0, stageLabel, stageDetail, error, onBack }) {
  const safeProgress = Math.min(100, Math.max(0, Number(progress) || 0));
  const currentIndex = status === "error" ? errorStepIndex(safeProgress) : (STATUS_INDEX[status] ?? 0);
  const running = !["ready", "error"].includes(status);
  const currentLabel = stageLabel || (status === "error" ? "Research failed" : status === "ready" ? "Research brief ready" : "Preparing research");
  const currentDetail = stageDetail || (status === "error" ? "Helix could not complete the evidence check." : status === "ready" ? "The evidence-backed brief is ready for guided setup." : "Helix is preparing the evidence pipeline.");

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
          <span>{status === "error" ? "stopped" : status === "ready" ? "complete" : "complete"}</span>
        </div>
      </div>

      <div className={`research-progress__bar ${status === "error" ? "is-error" : ""}`} aria-hidden="true">
        <span style={{ width: `${safeProgress}%` }} />
      </div>

      <div className={`research-progress__current ${status === "error" ? "is-error" : ""} ${status === "ready" ? "is-complete" : ""}`} aria-live="polite">
        {running ? <span className="research-progress__spinner" /> : <span className="research-progress__terminal-icon">{status === "ready" ? <IconCheck /> : "!"}</span>}
        <div>
          <strong>{currentLabel}</strong>
          <span>{currentDetail}</span>
        </div>
      </div>

      <div className="research-progress__steps">
        {STEPS.map(([key, label, detail], stepIndex) => {
          const complete = status === "ready" || (stepIndex < currentIndex && status !== "error") || (status === "error" && stepIndex < currentIndex);
          const current = (status !== "ready" && stepIndex === currentIndex) || (status === "queued" && stepIndex === 0);
          const failed = status === "error" && stepIndex === currentIndex;
          return (
            <div className={`research-progress__step ${complete ? "is-complete" : ""} ${current ? "is-current" : ""} ${failed ? "is-error" : ""}`} key={key}>
              <span className="research-progress__marker">{complete ? <IconCheck /> : failed ? "!" : String(stepIndex + 1).padStart(2, "0")}</span>
              <div className="research-progress__step-copy">
                <span>{label}</span>
                {current && status !== "error" && <small>{detail}</small>}
                {failed && <small>Stopped here.</small>}
              </div>
              {current && running && <span className="research-progress__pulse" aria-hidden="true" />}
            </div>
          );
        })}
      </div>

      {error && <div className="research-progress__error"><strong>Research couldn't finish.</strong><span>{error}</span><button className="btn btn-ghost" onClick={onBack}>Choose another signal</button></div>}
    </section>
  );
}
