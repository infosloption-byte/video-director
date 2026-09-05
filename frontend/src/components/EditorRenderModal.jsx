import { useCallback, useEffect, useRef, useState } from "react";

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export default function EditorRenderModal({ id, onClose }) {
  const timer = useRef(null);
  const [status, setStatus] = useState("idle"); const [progress, setProgress] = useState(0); const [stage, setStage] = useState("idle");
  const [message, setMessage] = useState("No render is currently running."); const [url, setUrl] = useState(""); const [error, setError] = useState("");
  const [busy, setBusy] = useState(false); const [version, setVersion] = useState(null);
  const apply = useCallback((data) => { const next = String(data.status || "idle"); setStatus(next); setProgress(Math.max(0, Math.min(100, Number(data.progress || 0)))); setStage(data.stage || next); setMessage(data.message || ""); setUrl(data.renderUrl || ""); setVersion(data.version == null ? null : Number(data.version)); setError(data.error || ""); return next; }, []);
  const getStatus = useCallback(() => api(`/api/projects/${id}/editor/render-status`), [id]);
  const poll = useCallback(async () => { try { const next = apply(await getStatus()); if (!["completed","failed","idle"].includes(next)) timer.current = window.setTimeout(() => void poll(), 1200); else setBusy(false); } catch (e) { setError(e.message); setBusy(false); } }, [apply,getStatus]);
  useEffect(() => { void getStatus().then(apply).catch((e) => setError(e.message)); return () => { if (timer.current) window.clearTimeout(timer.current); }; }, [apply,getStatus]);
  useEffect(() => { const onKey = (e) => { if (e.key === "Escape" && !busy) onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [busy,onClose]);
  async function start() { if (busy) return; setBusy(true); setError(""); setStatus("queued"); setProgress(0); setMessage("Submitting the saved editor timeline…"); try { const data = await api(`/api/projects/${id}/editor/render`, { method: "POST" }); apply(data); timer.current = window.setTimeout(() => void poll(), 300); } catch (e) { setStatus("failed"); setError(e.message); setBusy(false); } }
  async function refresh() { try { apply(await getStatus()); } catch (e) { setError(e.message); } }
  const label = status === "completed" ? "Ready" : status === "failed" ? "Failed" : status === "rendering" || status === "queued" ? "Rendering" : "Ready to render";
  return <div className="editor-render-modal" role="dialog" aria-modal="true" aria-labelledby="editor-render-title" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="editor-render-modal__card">
      <header className="editor-render-modal__header"><div><span className="editor-render-modal__eyebrow">FINAL OUTPUT</span><h2 id="editor-render-title">Render video</h2><p>Generate an MP4 from the current saved editor timeline.</p></div><button type="button" className="editor-render-modal__close" onClick={onClose} disabled={busy} aria-label="Close render dialog">×</button></header>
      <section className="editor-render-modal__status"><div className="editor-render-modal__status-row"><div><span className={`editor-render-modal__pill is-${status}`}>{label}</span><strong>{message || "Render status"}</strong></div><span className="editor-render-modal__percent">{progress}%</span></div><div className="editor-render-modal__progress"><span style={{ width: `${progress}%` }} /></div><div className="editor-render-modal__meta"><span>Stage · {stage}</span>{version != null && <span>Editor version · {version}</span>}</div></section>
      {error && <div className="editor-render-modal__error" role="alert">{error}</div>}
      {url && status === "completed" && <section className="editor-render-modal__result"><div><span>OUTPUT</span><strong>MP4 render is ready</strong><small>Your latest render is available to preview or download.</small></div><a className="btn btn-cream" href={url} target="_blank" rel="noreferrer">Open rendered MP4</a></section>}
      <footer className="editor-render-modal__footer"><button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn btn-ghost" onClick={refresh} disabled={busy}>Refresh status</button><button type="button" className="btn btn-cream" onClick={start} disabled={busy}>{busy ? "Rendering…" : status === "completed" ? "Render again" : "Render MP4"}</button></footer>
    </div>
  </div>;
}
