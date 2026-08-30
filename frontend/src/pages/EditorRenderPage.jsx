import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import { useAuth } from "../context/AuthContext";
import "../components/ui.css";
import "./EditorRenderPage.css";

export default function EditorRenderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const timerRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("idle");
  const [message, setMessage] = useState("Render the saved editor timeline to an MP4.");
  const [renderUrl, setRenderUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(null);
  const [renderHash, setRenderHash] = useState("");

  const applyStatus = useCallback((data) => {
    const nextStatus = String(data.status || "idle");
    setStatus(nextStatus);
    setProgress(Math.max(0, Math.min(100, Number(data.progress || 0))));
    setStage(data.stage || nextStatus);
    setMessage(data.message || "");
    setRenderUrl(data.renderUrl || "");
    setVersion(data.version == null ? null : Number(data.version));
    setRenderHash(data.renderHash || "");
    setError(data.error || "");
    return nextStatus;
  }, []);

  const fetchStatus = useCallback(async () => {
    const response = await fetch(`/api/projects/${id}/editor/render-status`, { credentials: "include", cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to read editor render status.");
    return data;
  }, [id]);

  async function poll() {
    try {
      const data = await fetchStatus();
      const nextStatus = applyStatus(data);
      if (!["completed", "failed", "idle"].includes(nextStatus)) {
        timerRef.current = window.setTimeout(() => { void poll(); }, 1200);
      } else {
        setBusy(false);
      }
    } catch (pollError) {
      setError(pollError.message || "Unable to read render status.");
      setBusy(false);
    }
  }

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const startRender = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setStatus("queued");
    setProgress(0);
    setMessage("Submitting the saved editor timeline to the render worker…");
    try {
      const response = await fetch(`/api/projects/${id}/editor/render`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to start editor render.");
      applyStatus(data);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => { void poll(); }, 300);
    } catch (renderError) {
      setStatus("failed");
      setError(renderError.message || "Unable to start editor render.");
      setMessage("The render could not be started.");
      setBusy(false);
    }
  };

  const refresh = async () => {
    setError("");
    try {
      const data = await fetchStatus();
      applyStatus(data);
    } catch (statusError) {
      setError(statusError.message || "Unable to read render status.");
    }
  };

  if (!user) return null;

  return (
    <div className="hx-page">
      <Header right={<Link to={`/editor/${id}`} className="btn btn-ghost">Back to editor</Link>} />
      <main className="container editor-render-page">
        <header className="editor-render-page__header">
          <div>
            <p className="eyebrow">Advanced editor · render</p>
            <h1>Render editor timeline</h1>
            <p>Render the saved canonical editor timeline without changing the original Storyboard output.</p>
          </div>
          <div className="editor-render-page__actions">
            <button className="btn btn-ghost" type="button" onClick={refresh} disabled={busy}>Refresh status</button>
            <button className="btn btn-cream" type="button" onClick={startRender} disabled={busy}>{busy ? "Rendering…" : "Render MP4"}</button>
          </div>
        </header>

        <section className="editor-render-card">
          <div className="editor-render-card__status">
            <span className={`editor-render-card__badge is-${status}`}>{status}</span>
            <strong>{message || "Editor render"}</strong>
          </div>
          <div className="editor-render-card__bar" aria-label="Render progress">
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="editor-render-card__meta">
            <span>{progress}%</span>
            <span>{stage}</span>
            {version != null && <span>Version {version}</span>}
            {renderHash && <span>{renderHash.slice(0, 12)}</span>}
          </div>

          {error && <div className="editor-render-card__error" role="alert">{error}</div>}
          {renderUrl && status === "completed" && (
            <div className="editor-render-card__result">
              <div><strong>MP4 ready.</strong><span>The rendered file belongs to this project and is protected by the existing project ownership rules.</span></div>
              <a className="btn btn-cream" href={renderUrl} target="_blank" rel="noreferrer">Open rendered MP4</a>
            </div>
          )}

          <div className="editor-render-card__footnote">
            {status === "completed" ? "Render completed successfully." : `Current render progress is ${progress}%.`}
          </div>
        </section>

        <button className="editor-render-page__back" type="button" onClick={() => navigate(`/editor/${id}`)}>Return to editing</button>
      </main>
    </div>
  );
}
