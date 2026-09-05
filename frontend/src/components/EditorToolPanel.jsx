import { useCallback, useEffect, useRef, useState } from "react";

const INTENTS = [
  ["Tighten pacing", "Tighten the pacing by shortening unnecessarily long video clips while preserving the story flow."],
  ["Improve hook", "Improve the opening hook. Make the first few seconds more compelling using safe timeline edits and, if useful, a short text overlay."],
  ["Clean captions", "Improve the existing captions for clarity and concise wording without changing their timing."],
  ["Rewrite narration", "Rewrite the narration for clarity and stronger delivery while preserving the original meaning. Return a narration regeneration suggestion, not a source-media change."],
  ["Replace B-roll", "Replace weak or repetitive B-roll with stronger existing assets from the same scene while preserving timing and source-scene ownership."],
  ["Balance audio", "Balance the editor audio levels so narration remains clear and music does not overpower it."],
];

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function Panel({ title, eyebrow, onClose, children }) {
  return <aside className="editor-tool-panel" aria-label={title}>
    <div className="editor-tool-panel__header"><div><span>{eyebrow}</span><strong>{title}</strong></div><button type="button" className="editor-tool-panel__close" onClick={onClose} aria-label={`Close ${title}`}>×</button></div>
    <div className="editor-tool-panel__body">{children}</div>
  </aside>;
}

function MediaPanel({ id, selectedClip, onReplace, onClose }) {
  const [media, setMedia] = useState([]); const [filter, setFilter] = useState("all"); const [query, setQuery] = useState(""); const [results, setResults] = useState([]); const [musicResults, setMusicResults] = useState([]); const [musicQuery, setMusicQuery] = useState("ambient cinematic"); const [busy, setBusy] = useState(""); const [message, setMessage] = useState(""); const [file, setFile] = useState(null);
  const load = useCallback(async () => { try { const data = await api(`/api/projects/${id}/media`); setMedia(data.media || []); } catch (e) { setMessage(e.message); } }, [id]);
  useEffect(() => { void load(); }, [load]);
  const visible = media.filter((item) => filter === "all" || item.kind === filter).filter((item) => !query.trim() || `${item.title || ""} ${item.filename || ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  async function searchVideo(e) { e?.preventDefault(); if (!query.trim()) return; setBusy("search"); try { const data = await api(`/api/projects/${id}/media/search?query=${encodeURIComponent(query.trim())}&limit=8`); setResults(data.results || []); } catch (err) { setMessage(err.message); } finally { setBusy(""); } }
  async function searchMusic(e) { e?.preventDefault(); if (!musicQuery.trim()) return; setBusy("music-search"); try { const data = await api(`/api/projects/${id}/media/music-search?query=${encodeURIComponent(musicQuery.trim())}&limit=10`); setMusicResults(data.results || []); } catch (err) { setMessage(err.message); } finally { setBusy(""); } }
  async function importItem(item, kind = "video") { const key = item.providerAssetId || item.videoUrl || item.audioUrl; if (!key) return; setBusy(key); try { const data = await api(`/api/projects/${id}/media`, { method: "POST", body: JSON.stringify({ kind, origin: "external", title: item.title || (kind === "audio" ? "Music" : "Video"), mediaUrl: kind === "audio" ? item.audioUrl : item.videoUrl, thumbnailUrl: item.thumbnailUrl, sourceUrl: item.sourceUrl, provider: item.provider || (kind === "audio" ? "jamendo" : "pexels"), providerAssetId: item.providerAssetId, width: item.width, height: item.height, durationSeconds: item.durationSeconds }) }); setMedia((items) => [data.media, ...items.filter((x) => x.id !== data.media.id)]); setMessage(data.created ? "Added to project library." : "Already in project library."); } catch (err) { setMessage(err.message); } finally { setBusy(""); } }
  async function upload() { if (!file) return; const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") ? "audio" : null; if (!kind) { setMessage("Choose a video, image, or audio file."); return; } setBusy("upload"); try { const params = new URLSearchParams({ kind, filename: file.name }); const response = await fetch(`/api/projects/${id}/media/upload?${params}`, { method: "PUT", credentials: "include", headers: { "Content-Type": file.type || "application/octet-stream", "X-Requested-With": "XMLHttpRequest" }, body: file }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Upload failed."); setMedia((items) => [data.media, ...items]); setFile(null); setMessage("Uploaded to project library."); } catch (err) { setMessage(err.message); } finally { setBusy(""); } }
  async function addToTimeline(item) { if (!selectedClip || item.kind === "image") { if (item.kind === "video") onReplace(item); return; } if (item.kind === "video") onReplace(item); }
  return <Panel title="Media Library" eyebrow="Editor tool" onClose={onClose}>
    <div className="editor-tool-tabs">{[["all","All"],["video","Video"],["image","Image"],["audio","Audio"]].map(([value,label]) => <button key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div>
    <div className="editor-tool-search"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search project media" /><button className="btn btn-ghost" onClick={searchVideo} disabled={busy === "search"}>{busy === "search" ? "Searching…" : "External video"}</button></div>
    <div className="editor-tool-upload"><input type="file" accept="video/*,image/*,audio/*" onChange={(e) => setFile(e.target.files?.[0] || null)} /><button className="btn btn-cream" disabled={!file || Boolean(busy)} onClick={upload}>{busy === "upload" ? "Uploading…" : "Upload"}</button></div>
    {message && <p className="editor-tool-message" role="status">{message}</p>}
    {results.length > 0 && <div className="editor-tool-section"><h3>External video</h3>{results.map((item) => <div className="editor-tool-row" key={item.providerAssetId || item.videoUrl}><div><strong>{item.title || "Video"}</strong><span>{item.durationSeconds ? `${Number(item.durationSeconds).toFixed(1)}s` : "External asset"}</span></div><button className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => void importItem(item)}>Import</button></div>)}</div>}
    <div className="editor-tool-grid">{visible.map((item) => <article key={item.id} className="editor-media-item"><div className="editor-media-item__preview">{item.kind === "video" ? <video src={item.proxyUrl || item.mediaUrl} poster={item.thumbnailUrl || undefined} muted playsInline preload="metadata" /> : item.kind === "image" ? <img src={item.thumbnailUrl || item.mediaUrl} alt="" /> : <span>♫</span>}</div><strong>{item.title || item.filename || "Untitled"}</strong><small>{item.kind}{item.durationSeconds ? ` · ${Number(item.durationSeconds).toFixed(1)}s` : ""}</small><button className="btn btn-ghost" onClick={() => void addToTimeline(item)} disabled={item.kind !== "video" || !selectedClip}>{selectedClip ? "Replace selected" : "Select a video clip"}</button></article>)}</div>
    <div className="editor-tool-section"><h3>Music search</h3><form className="editor-tool-search" onSubmit={searchMusic}><input value={musicQuery} onChange={(e) => setMusicQuery(e.target.value)} /><button className="btn btn-ghost" disabled={busy === "music-search"}>{busy === "music-search" ? "Searching…" : "Search"}</button></form>{musicResults.map((item) => <div className="editor-tool-row" key={item.providerAssetId || item.audioUrl}><div><strong>{item.title || "Music"}</strong><span>{item.durationSeconds ? `${Number(item.durationSeconds).toFixed(1)}s` : ""}</span></div><button className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => void importItem(item, "audio")}>Import</button></div>)}</div>
  </Panel>;
}

function AIPanel({ id, onClose, onApplied }) {
  const [instruction, setInstruction] = useState(""); const [suggestion, setSuggestion] = useState(null); const [preview, setPreview] = useState(null); const [undoVersion, setUndoVersion] = useState(null); const [undoTimeline, setUndoTimeline] = useState(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [version, setVersion] = useState(null);
  async function suggest() { if (!instruction.trim()) return; setBusy(true); setError(""); setSuggestion(null); setPreview(null); try { const data = await api(`/api/projects/${id}/editor/ai/suggest`, { method: "POST", body: JSON.stringify({ instruction }) }); setVersion(data.baseVersion); setSuggestion(data); setMessage("Suggestion ready. Preview before applying."); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function previewSuggestion() { if (!suggestion) return; setBusy(true); setError(""); try { const data = await api(`/api/projects/${id}/editor/ai/preview`, { method: "POST", body: JSON.stringify({ operations: suggestion.operations }) }); setVersion(data.baseVersion); setPreview(data); setMessage("Preview validated. Nothing has been saved."); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function apply() { if (!suggestion || version == null) return; setBusy(true); setError(""); try { const current = await api(`/api/projects/${id}/editor`); if (Number(current.editor.version) !== Number(version)) throw new Error("Editor changed elsewhere. Generate a new suggestion."); const before = JSON.parse(JSON.stringify(current.editor.timeline)); const data = await api(`/api/projects/${id}/editor/ai/apply`, { method: "POST", body: JSON.stringify({ version: Number(version), operations: suggestion.operations }) }); setUndoTimeline(before); setUndoVersion(Number(data.editor.version)); setVersion(Number(data.editor.version)); setMessage("AI edits applied."); setPreview(null); onApplied?.(data.editor); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function undo() { if (!undoTimeline || undoVersion == null) return; setBusy(true); try { const data = await api(`/api/projects/${id}/editor`, { method: "PATCH", body: JSON.stringify({ version: undoVersion, timeline: undoTimeline }) }); setUndoTimeline(null); setUndoVersion(null); setVersion(Number(data.editor.version)); setMessage("AI change undone."); onApplied?.(data.editor); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return <Panel title="AI Assistance" eyebrow="Editor tool" onClose={onClose}>
    <p className="editor-tool-copy">Ask Helix to propose safe, reversible changes to the saved editor timeline.</p>
    <div className="editor-intent-list">{INTENTS.map(([label,text]) => <button key={label} onClick={() => { setInstruction(text); setSuggestion(null); setPreview(null); }}>{label}</button>)}</div>
    <textarea rows="5" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Tell Helix what you want to change…" />
    <div className="editor-tool-actions"><button className="btn btn-cream" disabled={busy || !instruction.trim()} onClick={suggest}>{busy ? "Working…" : "Suggest edits"}</button>{suggestion && <button className="btn btn-ghost" disabled={busy} onClick={previewSuggestion}>Preview</button>}{preview && <button className="btn btn-cream" disabled={busy} onClick={apply}>Apply</button>}{undoTimeline && <button className="btn btn-ghost" disabled={busy} onClick={undo}>Undo AI</button>}</div>
    {error && <div className="editor-tool-error" role="alert">{error}</div>}{message && <p className="editor-tool-message">{message}</p>}
    {suggestion && <div className="editor-ai-result"><h3>{suggestion.summary}</h3><p>{suggestion.reasoning}</p><strong>{suggestion.operations.length} proposed operation{suggestion.operations.length === 1 ? "" : "s"}</strong>{suggestion.operations.map((op,i) => <div key={`${op.type}-${op.clipId || op.id || i}`}><b>{op.type}</b><small>{op.clipId || op.id || ""}</small></div>)}</div>}
    {preview && <div className="editor-ai-result"><h3>Preview validated</h3><p>Nothing has been persisted yet.</p><span>Result duration: {Number(preview.timeline?.duration || 0).toFixed(3)}s</span></div>}
  </Panel>;
}

function RenderPanel({ id, onClose }) {
  const timer = useRef(null); const [status, setStatus] = useState("idle"); const [progress, setProgress] = useState(0); const [stage, setStage] = useState("idle"); const [message, setMessage] = useState("Render the saved editor timeline to an MP4."); const [url, setUrl] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [version, setVersion] = useState(null);
  const apply = useCallback((data) => { setStatus(String(data.status || "idle")); setProgress(Math.max(0, Math.min(100, Number(data.progress || 0)))); setStage(data.stage || data.status || "idle"); setMessage(data.message || ""); setUrl(data.renderUrl || ""); setVersion(data.version == null ? null : Number(data.version)); setError(data.error || ""); return String(data.status || "idle"); }, []);
  const getStatus = useCallback(async () => api(`/api/projects/${id}/editor/render-status`), [id]);
  const poll = useCallback(async () => { try { const next = apply(await getStatus()); if (!["completed","failed","idle"].includes(next)) timer.current = window.setTimeout(() => void poll(), 1200); else setBusy(false); } catch (e) { setError(e.message); setBusy(false); } }, [apply,getStatus]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  async function start() { if (busy) return; setBusy(true); setError(""); setStatus("queued"); setProgress(0); setMessage("Submitting the saved editor timeline…"); try { const data = await api(`/api/projects/${id}/editor/render`, { method: "POST" }); apply(data); if (timer.current) window.clearTimeout(timer.current); timer.current = window.setTimeout(() => void poll(), 300); } catch (e) { setStatus("failed"); setError(e.message); setBusy(false); } }
  async function refresh() { try { apply(await getStatus()); } catch (e) { setError(e.message); } }
  return <Panel title="Render Video" eyebrow="Editor tool" onClose={onClose}>
    <div className="editor-render-status"><span className={`is-${status}`}>{status}</span><strong>{message}</strong></div>
    <div className="editor-render-progress"><span style={{ width: `${progress}%` }} /></div><div className="editor-render-meta"><span>{progress}%</span><span>{stage}</span>{version != null && <span>Version {version}</span>}</div>
    {error && <div className="editor-tool-error">{error}</div>}
    {url && status === "completed" && <div className="editor-render-result"><strong>MP4 ready</strong><a className="btn btn-cream" href={url} target="_blank" rel="noreferrer">Open rendered MP4</a></div>}
    <div className="editor-tool-actions"><button className="btn btn-cream" disabled={busy} onClick={start}>{busy ? "Rendering…" : "Render MP4"}</button><button className="btn btn-ghost" disabled={busy} onClick={refresh}>Refresh</button></div>
  </Panel>;
}

function ProductivityPanel({ id, onClose }) {
  const [versions,setVersions]=useState([]); const [templates,setTemplates]=useState([]); const [activity,setActivity]=useState([]); const [links,setLinks]=useState([]); const [label,setLabel]=useState(""); const [templateName,setTemplateName]=useState(""); const [busy,setBusy]=useState(false); const [message,setMessage]=useState(""); const [error,setError]=useState("");
  const refresh=useCallback(async()=>{try{const [v,t,a,r]=await Promise.all([api(`/api/projects/${id}/versions`),api("/api/templates"),api(`/api/projects/${id}/activity`),api(`/api/projects/${id}/review-links`)]);setVersions(v.versions||[]);setTemplates(t.templates||[]);setActivity(a.activity||[]);setLinks(r.reviews||[]);}catch(e){setError(e.message);}},[id]);
  useEffect(()=>{void refresh();},[refresh]);
  async function action(fn,success){setBusy(true);setError("");try{await fn();setMessage(success);await refresh();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <Panel title="Productivity" eyebrow="Editor tool" onClose={onClose}>
    {error&&<div className="editor-tool-error">{error}</div>}{message&&<p className="editor-tool-message">{message}</p>}
    <div className="editor-tool-section"><h3>Versions</h3><div className="editor-tool-search"><input value={label} onChange={e=>setLabel(e.target.value)} placeholder="Snapshot label"/><button className="btn btn-cream" disabled={busy} onClick={()=>action(()=>api(`/api/projects/${id}/versions`,{method:"POST",body:JSON.stringify({label})}),"Version snapshot created.")}>Save</button></div>{versions.map(v=><div className="editor-tool-row" key={v.id}><div><strong>v{v.versionNumber} · {v.label}</strong><span>{new Date(v.createdAt).toLocaleString()}</span></div><button className="btn btn-ghost" disabled={busy} onClick={()=>action(async()=>{const e=await api(`/api/projects/${id}/editor`);await api(`/api/projects/${id}/restore/${v.id}`,{method:"POST",body:JSON.stringify({version:e.editor.version})});},`Restored ${v.label}.`)}>Restore</button></div>)}</div>
    <div className="editor-tool-section"><h3>Templates</h3><div className="editor-tool-search"><input value={templateName} onChange={e=>setTemplateName(e.target.value)} placeholder="Template name"/><button className="btn btn-cream" disabled={busy||!templateName.trim()} onClick={()=>action(()=>api(`/api/projects/${id}/template`,{method:"POST",body:JSON.stringify({name:templateName})}),"Template saved.")}>Save</button></div>{templates.map(t=><div className="editor-tool-row" key={t.id}><strong>{t.name}</strong><div><button className="btn btn-ghost" disabled={busy} onClick={()=>action(async()=>{const e=await api(`/api/projects/${id}/editor`);await api(`/api/projects/${id}/apply-template/${t.id}`,{method:"POST",body:JSON.stringify({version:e.editor.version})});},`Template applied: ${t.name}`)}>Apply</button><button className="btn btn-ghost" disabled={busy} onClick={()=>action(()=>api(`/api/templates/${t.id}`,{method:"DELETE"}),`Template deleted: ${t.name}`)}>Delete</button></div></div>)}</div>
    <div className="editor-tool-section"><h3>Review</h3><button className="btn btn-cream" disabled={busy} onClick={()=>action(async()=>{const d=await api(`/api/projects/${id}/review-links`,{method:"POST",body:JSON.stringify({})});setMessage(`Review link created: ${window.location.origin}/review/${d.review.token}`);},"Review link created.")}>Create review link</button>{links.map(l=><div className="editor-tool-row" key={l.id}><div><strong>{l.revokedAt?"Revoked":"Active"}</strong><span>{l._count?.comments||0} comments</span></div><button className="btn btn-ghost" disabled={busy||Boolean(l.revokedAt)} onClick={()=>action(()=>api(`/api/projects/${id}/review-links/${l.id}`,{method:"DELETE"}),"Review link revoked.")}>Revoke</button></div>)}</div>
    <div className="editor-tool-section"><h3>Activity</h3>{activity.slice(0,12).map(a=><div className="editor-tool-activity" key={a.id}><strong>{a.action}</strong><span>{new Date(a.createdAt).toLocaleString()}</span></div>)}{!activity.length&&<p className="editor-tool-copy">No activity yet.</p>}</div>
  </Panel>;
}

export default function EditorToolPanel({ tool, id, selectedClip, onReplaceMedia, onApplied, onClose }) {
  if (tool === "media") return <MediaPanel id={id} selectedClip={selectedClip} onReplace={onReplaceMedia} onClose={onClose} />;
  if (tool === "ai") return <AIPanel id={id} onClose={onClose} onApplied={onApplied} />;
  if (tool === "render") return <RenderPanel id={id} onClose={onClose} />;
  if (tool === "productivity") return <ProductivityPanel id={id} onClose={onClose} />;
  return null;
}
