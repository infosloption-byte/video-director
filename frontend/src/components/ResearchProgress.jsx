import { IconArrowLeft, IconCheck } from "./Icons";
import "./ResearchProgress.css";

const STEPS = [
  ["planning", "Planning the research", "Breaking the topic into answerable evidence questions."],
  ["discovering", "Discovering sources", "Searching academic, institutional, news, and independent evidence."],
  ["reading", "Reading sources", "Opening selected sources and extracting their available evidence."],
  ["verifying", "Verifying evidence", "Checking support, source quality, and conflicting findings."],
  ["synthesizing", "Synthesizing findings", "Building the detailed research intelligence brief."],
  ["ready", "Research brief ready", "The evidence-backed brief is ready for guided setup."],
];

const STATUS_INDEX = { queued: 0, planning: 0, discovering: 1, reading: 2, verifying: 3, synthesizing: 4, ready: 5, error: 0 };

export default function ResearchProgress({ status, progress = 0, stageLabel, stageDetail, error, onBack, onRetry, retrying = false }) {
  const safeProgress = Math.min(100, Math.max(0, Number(progress) || 0));
  const currentIndex = status === "error" ? Math.min(4, Math.max(0, Math.floor(safeProgress / 22))) : (STATUS_INDEX[status] ?? 0);
  const running = !["ready", "error"].includes(status);
  const currentLabel = stageLabel || (status === "error" ? "Research failed" : status === "ready" ? "Research brief ready" : "Preparing deep research");
  const currentDetail = stageDetail || (status === "error" ? "Helix could not complete the evidence check." : status === "ready" ? "The evidence-backed brief is ready for guided setup." : "Helix is preparing the evidence pipeline.");

  return (
    <section className="research-progress" aria-live="polite">
      <button className="btn btn-ghost research-progress__back" onClick={onBack}>
        <IconArrowLeft className="btn-icon" /> Back to signals
      </button>
      <p className="eyebrow">Deep research stage</p>
      <div className="research-progress__title-row">
        <div>
          <h1>Building the research brief.</h1>
          <p className="research-progress__lead">Helix is planning, reading, cross-checking, and synthesizing evidence before making creative recommendations.</p>
        </div>
        <div className="research-progress__percent" aria-label={`${safeProgress}% complete`}>
          <strong>{safeProgress}%</strong>
          <span>{status === "error" ? "stopped" : status === "ready" ? "complete" : "in progress"}</span>
        </div>
      </div>

      <div className={`research-progress__bar ${status === "error" ? "is-error" : ""}`} aria-hidden="true"><span style={{ width: `${safeProgress}%` }} /></div>

      <div className={`research-progress__current ${status === "error" ? "is-error" : ""} ${status === "ready" ? "is-complete" : ""}`} aria-live="polite">
        {running ? <span className="research-progress__spinner" /> : <span className="research-progress__terminal-icon">{status === "ready" ? <IconCheck /> : "!"}</span>}
        <div><strong>{currentLabel}</strong><span>{currentDetail}</span></div>
      </div>

      <div className="research-progress__steps">
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

      {error && <div className="research-progress__error"><strong>Research couldn't finish.</strong><span>{error}</span><div><button className="btn btn-cream" onClick={onRetry} disabled={retrying}>{retrying ? "Retrying research…" : "Retry research"}</button><button className="btn btn-ghost" onClick={onBack} disabled={retrying}>Choose another signal</button></div></div>}
    </section>
  );
}
