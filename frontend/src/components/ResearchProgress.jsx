import { useState } from "react";
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

export default function ResearchProgress({ status, progress = 0, stageLabel, stageDetail, error, onBack, onRetry, retrying = false, projectId }) {
  const [stopping, setStopping] = useState(false);
  const [stoppedLocally, setStoppedLocally] = useState(false);
  const resolvedProjectId = projectId || (typeof window !== "undefined" ? window.location.pathname.split("/").filter(Boolean).pop() : "");
  const safeProgress = Math.min(100, Math.max(0, Number(progress) || 0));
  const effectiveStatus = stoppedLocally ? "error" : status;
  const effectiveError = stoppedLocally ? "Research was stopped by the user." : error;
  const currentIndex = effectiveStatus === "error" ? Math.min(STEPS.length - 1, Math.max(0, Math.floor(safeProgress / (100 / STEPS.length)))) : (STATUS_INDEX[effectiveStatus] ?? 0);
  const running = !["ready", "error"].includes(effectiveStatus);
  const stopped = effectiveStatus === "error" && /stopped by the user/i.test(effectiveError || "");
  const currentLabel = stageLabel || (effectiveStatus === "error" ? "Research stopped" : effectiveStatus === "ready" ? "Research brief ready" : "Preparing deep research");
  const currentDetail = stageDetail || (effectiveStatus === "error" ? (stopped ? "The research run was stopped before the evidence brief was completed." : "Helix could not complete the evidence pipeline.") : effectiveStatus === "ready" ? "The evidence-backed brief is ready for guided setup." : "Helix is preparing the evidence pipeline.");

  async function stopResearch() {
    if (!resolvedProjectId || stopping || !running) return;
    setStopping(true);
    try {
      const response = await fetch(`/api/projects/${resolvedProjectId}/research/stop`, { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to stop research.");
      setStoppedLocally(true);
    } catch (stopError) {
      window.alert(stopError.message || "Failed to stop research.");
    } finally {
      setStopping(false);
    }
  }

  return (
    <section className="research-progress" aria-label="Deep research progress">
      <button className="btn btn-ghost research-progress__back" onClick={onBack}>
        <IconArrowLeft className="btn-icon" /> Back to signals
      </button>
      <p className="eyebrow">Deep research</p>
      <div className="research-progress__title-row">
        <div>
          <h1>{effectiveStatus === "ready" ? "Research brief ready." : stopped ? "Research stopped." : effectiveStatus === "error" ? "Research needs attention." : "Building the research brief."}</h1>
          <p className="research-progress__lead">Helix plans, discovers, reads, verifies, resolves conflicts, and synthesizes evidence before making creative recommendations.</p>
        </div>
        <div className="research-progress__percent" aria-label={`${safeProgress}% complete`}>
          <strong>{safeProgress}%</strong>
          <span>{effectiveStatus === "error" ? "stopped" : effectiveStatus === "ready" ? "complete" : "in progress"}</span>
        </div>
      </div>

      <div className={`research-progress__bar ${effectiveStatus === "error" ? "is-error" : ""}`} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={safeProgress} aria-label="Research completion"><span style={{ width: `${safeProgress}%` }} /></div>

      <div className={`research-progress__current ${effectiveStatus === "error" ? "is-error" : ""} ${effectiveStatus === "ready" ? "is-complete" : ""}`} aria-live="polite">
        {running ? <span className="research-progress__spinner" aria-hidden="true" /> : <span className="research-progress__terminal-icon" aria-hidden="true">{effectiveStatus === "ready" ? <IconCheck /> : "!"}</span>}
        <div><strong>{currentLabel}</strong><span>{currentDetail}</span></div>
      </div>

      <div className="research-progress__steps" aria-label="Research pipeline">
        {STEPS.map(([key, label, detail], stepIndex) => {
          const complete = effectiveStatus === "ready" || stepIndex < currentIndex;
          const current = effectiveStatus !== "ready" && stepIndex === currentIndex;
          const failed = effectiveStatus === "error" && stepIndex === currentIndex;
          return (
            <div className={`research-progress__step ${complete ? "is-complete" : ""} ${current ? "is-current" : ""} ${failed ? "is-error" : ""}`} key={key}>
              <span className="research-progress__marker">{complete ? <IconCheck /> : failed ? "!" : String(stepIndex + 1).padStart(2, "0")}</span>
              <div className="research-progress__step-copy"><span>{label}</span>{current && effectiveStatus !== "error" && <small>{detail}</small>}{failed && <small>{stopped ? "Stopped by you." : "Stopped here."}</small>}</div>
              {current && running && <span className="research-progress__pulse" aria-hidden="true" />}
            </div>
          );
        })}
      </div>

      {running && resolvedProjectId && <div className="research-progress__stop"><button className="btn btn-ghost" type="button" onClick={stopResearch} disabled={stopping}>{stopping ? "Stopping research…" : "Stop research"}</button><span>Stop now and retry this research run later.</span></div>}
      {effectiveError && <div className="research-progress__error" role="alert"><strong>{stopped ? "Research stopped." : "Research couldn't finish."}</strong><span>{effectiveError}</span><div><button className="btn btn-cream" onClick={onRetry} disabled={retrying || stopping}>{retrying ? "Retrying research…" : "Retry research"}</button><button className="btn btn-ghost" onClick={onBack} disabled={retrying || stopping}>Choose another signal</button></div></div>}
    </section>
  );
}
