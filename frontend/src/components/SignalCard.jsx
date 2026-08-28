import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconArrowUpRight } from "./Icons";
import ConfirmDialog from "./ConfirmDialog";
import "./SignalCard.css";

export default function SignalCard({ signal, featured = false }) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [dialog, setDialog] = useState({ open: false, title: "", message: "" });

  async function directSignal() {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId: signal.id, signal: signal.origin === "search" ? signal : undefined }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Couldn't start research.");
      navigate(`/research/${data.project.id}`);
    } catch (error) {
      console.error("Failed to start research:", error);
      setDialog({
        open: true,
        title: "Couldn't start research",
        message: error.message || "Something went wrong while starting the research project.",
      });
    } finally { setPending(false); }
  }

  return (
    <>
      <article className={`signal-card ${featured ? "signal-card--featured" : ""}`}>
        <div className="signal-card__media" style={{ background: signal.thumb }} aria-hidden="true" />
        <div className="signal-card__body">
          <div className="signal-card__meta"><span className="mono-label signal-card__rank">{signal.rank}</span><span className="tag">{signal.category}</span><span className="tag-pct">{signal.pct}</span></div>
          <h3 className="signal-card__title">{signal.title}</h3>
          <p className="signal-card__desc">{signal.description}</p>
          <div className="signal-card__footer">
            <p className="signal-card__why"><span className="mono-label">{signal.whyLabel}</span> {signal.why}</p>
            <div className="signal-card__actions">
              <span className="signal-card__source">{signal.source} <span className="signal-card__dot">·</span> {signal.sourceNote}</span>
              <button className="btn btn-cream" disabled={pending} onClick={directSignal}>{pending ? "Starting research…" : "Direct this Reel"} <IconArrowUpRight className="btn-icon" /></button>
            </div>
          </div>
        </div>
      </article>
      <ConfirmDialog
        open={dialog.open}
        title={dialog.title}
        message={dialog.message}
        confirmLabel="OK"
        cancelLabel="Dismiss"
        onConfirm={() => setDialog({ open: false, title: "", message: "" })}
        onCancel={() => setDialog({ open: false, title: "", message: "" })}
      />
    </>
  );
}
