import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconArrowLeft, IconCheck } from "./Icons";
import ResearchConflictActions from "./ResearchConflictActions";
import "./ResearchProgress.css";
import "./ResearchConflictActions.css";

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
  const navigate = useNavigate();
  const [stopping, setStopping] = useState(false);
  const [stoppedLocally, setStoppedLocally] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [focusedRerunOpen, setFocusedRerunOpen] = useState(false);
  const [focus, setFocus] = useState("");
  const [actionMessage, setActionMessage] = useState("");
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

  async function runReportAction(action, body = {}) {
    if (!resolvedProjectId || actionBusy) return false;
    setActionBusy(action);
    setActionMessage("");
    try {
      const response = await fetch(`/api/projects/${resolvedProjectId}/research/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Failed to ${action} research.`);
      setActionMessage(action === "rerun" ? "Focused rerun started with the existing corpus retained." : "Research brief regenerated from persisted research without repeating external research.");
      window.setTimeout(() => window.location.reload(), 700);
      return true;
    } catch (actionError) {
      setActionMessage(actionError.message || `Failed to ${action} research.`);
      return false;
    } finally {
      setActionBusy("");
    }
  }

  async function handleFocusedRerun(event) {
    event.preventDefault();
    const trimmed = focus.trim();
    if (!trimmed || actionBusy) return;
    const ok = await runReportAction("rerun", { focus: trimmed });
    if (ok) setFocusedRerunOpen(false);
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

      {effectiveStatus === "ready" && resolvedProjectId && (
        <>
          <div className="research-progress__ready-actions" aria-label="Research next actions">
            <button className="btn btn-cream research-progress__primary-action" type="button" onClick={() => navigate(`/storyboard/${resolvedProjectId}?stage=setup`)}>Continue to Storyboard →</button>
            <div className="research-progress__secondary-actions">
              <button className="btn btn-ghost" type="button" onClick={() => void runReportAction("regenerate")} disabled={Boolean(actionBusy)}>{actionBusy === "regenerate" ? "Regenerating…" : "Regenerate brief"}</button>
              <button className="btn btn-ghost" type="button" onClick={() => setFocusedRerunOpen((value) => !value)} disabled={Boolean(actionBusy)} aria-expanded={focusedRerunOpen}>Focused rerun</button>
            </div>
            {focusedRerunOpen && (
              <form className="research-progress__rerun-form" onSubmit={handleFocusedRerun}>
                <label htmlFor="research-rerun-focus">Research focus</label>
                <div>
                  <input id="research-rerun-focus" value={focus} onChange={(event) => setFocus(event.target.value)} maxLength={400} placeholder="e.g. focus on recent evidence or a disputed mechanism" disabled={Boolean(actionBusy)} />
                  <button className="btn btn-cream" type="submit" disabled={Boolean(actionBusy) || !focus.trim()}>{actionBusy === "rerun" ? "Starting…" : "Run focus"}</button>
                </div>
                <span>Creates a new focused research session while retaining earlier persisted sessions.</span>
              </form>
            )}
            {actionMessage && <p className="research-progress__action-message" role="status">{actionMessage}</p>}
          </div>
          <ResearchConflictActions projectId={resolvedProjectId} />
        </>
      )}

      {running && resolvedProjectId && <div className="research-progress__stop"><button className="btn btn-ghost" type="button" onClick={stopResearch} disabled={stopping}>{stopping ? "Stopping research…" : "Stop research"}</button><span>Stop now and retry this research run later.</span></div>}
      {effectiveError && <div className="research-progress__error" role="alert"><strong>{stopped ? "Research stopped." : "Research couldn't finish."}</strong><span>{effectiveError}</span><div><button className="btn btn-cream" onClick={onRetry} disabled={retrying || stopping}>{retrying ? "Retrying research…" : "Retry research"}</button><button className="btn btn-ghost" onClick={onBack} disabled={retrying || stopping}>Choose another signal</button></div></div>}
    </section>
  );
}
