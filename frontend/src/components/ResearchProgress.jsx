import { useEffect, useMemo } from "react";
import { IconArrowLeft, IconCheck } from "./Icons";
import "./ResearchProgress.css";

const STEPS = [
  ["reading", "Reading the source"],
  ["cross_checking", "Cross-checking claims"],
  ["drafting", "Drafting the research brief"],
  ["ready", "Research brief ready"],
];

export default function ResearchProgress({ status, error, onBack, onReady }) {
  const index = useMemo(() => {
    if (status === "queued") return 0;
    const found = STEPS.findIndex(([key]) => key === status);
    return found < 0 ? 0 : found;
  }, [status]);

  useEffect(() => {
    if (status === "ready") onReady?.();
  }, [status, onReady]);

  return (
    <section className="research-progress" aria-live="polite">
      <button className="btn btn-ghost research-progress__back" onClick={onBack}>
        <IconArrowLeft className="btn-icon" /> Back to signals
      </button>
      <p className="eyebrow">Research stage</p>
      <h1>Building the research brief.</h1>
      <p className="research-progress__lead">Helix is checking the selected signal against trusted sources before recommending how to direct it.</p>

      <div className="research-progress__steps">
        {STEPS.map(([key, label], stepIndex) => {
          const complete = status === "ready" || stepIndex < index;
          const current = !complete && stepIndex === index && status !== "error";
          return (
            <div className={`research-progress__step ${complete ? "is-complete" : ""} ${current ? "is-current" : ""}`} key={key}>
              <span className="research-progress__marker">{complete ? <IconCheck /> : String(stepIndex + 1).padStart(2, "0")}</span>
              <span>{label}</span>
            </div>
          );
        })}
      </div>

      {error && <div className="research-progress__error"><strong>Research couldn't finish.</strong><span>{error}</span><button className="btn btn-ghost" onClick={onBack}>Choose another signal</button></div>}
    </section>
  );
}
