import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconArrowUpRight } from "./Icons";
import ConfirmDialog from "./ConfirmDialog";
import AuthChoiceDialog from "./AuthChoiceDialog";
import { useAuth } from "../context/AuthContext";
import "./SignalCard.css";

export default function SignalCard({ signal, featured = false }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [pending, setPending] = useState(false);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const [errorDialog, setErrorDialog] = useState({ open: false, title: "", message: "" });

  async function directSignal() {
    if (pending) return;
    if (!user) {
      setAuthPromptOpen(true);
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ signalId: signal.id, signal: signal.origin === "search" ? signal : undefined }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Couldn't start research.");
      navigate(`/research/${data.project.id}`);
    } catch (error) {
      console.error("Failed to start research:", error);
      setErrorDialog({ open: true, title: "Couldn't start research", message: error.message || "Something went wrong while starting the research project." });
    } finally { setPending(false); }
  }

  const closeAuthPrompt = () => setAuthPromptOpen(false);
  const returnPath = "/";

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
            <div className="signal-card__actions"><span className="signal-card__source">{signal.source} <span className="signal-card__dot">·</span> {signal.sourceNote}</span><button className="btn btn-cream" disabled={pending} onClick={directSignal}>{pending ? "Starting research…" : "Direct this Reel"} <IconArrowUpRight className="btn-icon" /></button></div>
          </div>
        </div>
      </article>

      <AuthChoiceDialog
        open={authPromptOpen}
        title="Save this Reel to your workspace."
        message="Sign in or create a free account to direct this signal. After authentication, Helix will bring you back to the public Signals page."
        onSignIn={() => navigate(`/signin?next=${encodeURIComponent(returnPath)}`)}
        onSignUp={() => navigate(`/signup?next=${encodeURIComponent(returnPath)}`)}
        onClose={closeAuthPrompt}
      />
      <ConfirmDialog
        open={errorDialog.open}
        title={errorDialog.title}
        message={errorDialog.message}
        confirmLabel="OK"
        cancelLabel="Dismiss"
        onConfirm={() => setErrorDialog({ open: false, title: "", message: "" })}
        onCancel={() => setErrorDialog({ open: false, title: "", message: "" })}
      />
    </>
  );
}
