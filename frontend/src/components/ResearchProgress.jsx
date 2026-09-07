import { IconArrowLeft, IconCheck } from "./Icons";
import "./ResearchProgress.css";

const STEPS = [
  ["planning", "Planning", "Breaking the topic into answerable evidence questions."],
  ["discovering", "Discovering", "Finding diverse, relevant sources."],
  ["reading", "Reading", "Opening selected sources and extracting evidence."],
  ["verifying", "Verifying", "Checking support, quality, and conflicts."],
  ["resolving", "Resolving", "Adjudicating meaningful evidence conflicts."],
  ["synthesizing", "Synthesizing", "Building the research intelligence brief."],
  ["ready", "Ready", "The evidence-backed brief is ready."],
];

const STATUS_INDEX = { queued: 0, planning: 0, discovering: 1, reading: 2, verifying: 3, resolving: 4, synthesizing: 5, ready: 6, error: 0 };

export default function ResearchProgress({ status, progress = 0, stageLabel, stageDetail, error, onBack, onRetry, retrying = false }) {
  const safeProgress = Math.min(100, Math.max(0, Number(progress) || 0));
  const currentIndex = status === "error" ? Math.min(STEPS.length - 1, Math.max(0, Math.floor(safeProgress / (100 / STEPS.length)))) : (STATUS_INDEX[status] ?? 0);
  const running = !["ready", "error"].includes(status);
  const currentLabel = stageLabel || (status === "error" ? "Research stopped" : status === "ready" ? "Research brief ready" : "Preparing deep research");
  const currentDetail = stageDetail || (status === "error" ? "Helix could not complete the evidence pipeline." : status === "ready" ? "The evidence-backed brief is ready for guided setup." : "Helix is preparing the evidence pipeline.");

  return (
    <section className="research-progress" aria-label="Deep research progress">
      <button className="btn btn-ghost research-progress__back" onClick={onBack}>
        <IconArrowLeft className="btn-icon" /> Back to signals
      </button>
      <p className="eyebrow">Deep research</p>
      <div className="research-progress__title-row">
        <div>
          <h1>{status === "ready" ? "Research brief ready." : status === "error" ? "Research needs attention." : "Building the research brief."}</h1>
          <p className="research-progress__lead">Helix plans, discovers, reads, verifies, resolves conflicts, and synthesizes evidence before making creative recommendations.</p>
        </div>
        <div className="research-progress__percent" aria-label={`${safeProgress}% complete`}>
          <strong>{safeProgress}%</strong>
          <span>{status === "error" ? "stopped" : status === "ready" ? "complete" : "in progress"}</span>
        </div>
      </div>

      <div className={`research-progress__bar ${status === "error" ? "is-error" : ""}`} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={safeProgress} aria-label="Research completion"><span style={{ width: `${safeProgress}%` }} /></div>

      <div className={`research-progress__current ${status === "error" ? "is-error" : ""} ${status === "ready" ? "is-complete" : ""}`} aria-live="polite">
        {running ? <span className="research-progress__spinner" aria-hidden="true" /> : <span className="research-progress__terminal-icon" aria-hidden="true">{status === "ready" ? <IconCheck /> : "!"}</span>}
        <div><strong>{currentLabel}</strong><span>{currentDetail}</span></div>
      </div>

      <div className="research-progress__steps" aria-label="Research pipeline">
        {STEPS.map(([key, label, detail], stepIndex) => {
          const complete = status === "ready" || stepIndex < currentIndex;
          const current = status !== "ready" && stepIndex === currentIndex;
          const failed = status === "error" && stepIndex === currentIndex;
          return (
            <div className={`research-progress__step ${complete ? "is-complete" : ""} ${current ? "is-current" : ""} ${failed ? "is-error" : ""}`} key={key}>
              <span className="research-progress__marker">{complete ? <IconCheck /> : failed ? "!" : String(stepIndex + 1).padStart(2, "0")}</span>
              <div className="research-progress__step-copy"><span>{label}</span>{current && status !== "error" && <small>{detail}</small>}{failed && <small>Stopped here.</small>}</div>
              {current && running && <span className="research-progress__pulse" aria-hidden="true" />}
            </div>
          );
        })}
      </div>

      {error && <div className="research-progress__error" role="alert"><strong>Research couldn't finish.</strong><span>{error}</span><div><button className="btn btn-cream" onClick={onRetry} disabled={retrying}>{retrying ? "Retrying research…" : "Retry research"}</button><button className="btn btn-ghost" onClick={onBack} disabled={retrying}>Choose another signal</button></div></div>}
    </section>
  );
}
