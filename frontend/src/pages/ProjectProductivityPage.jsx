import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Header from "../components/Header";
import "../components/ui.css";

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "include", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export default function ProjectProductivityPage() {
  const { id } = useParams();
  const [versions, setVersions] = useState([]); const [templates, setTemplates] = useState([]); const [activity, setActivity] = useState([]); const [links, setLinks] = useState([]);
  const [label, setLabel] = useState(""); const [templateName, setTemplateName] = useState(""); const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [versionData, templateData, activityData] = await Promise.all([api(`/api/projects/${id}/versions`), api("/api/templates"), api(`/api/projects/${id}/activity`)]);
      setVersions(versionData.versions || []); setTemplates(templateData.templates || []); setActivity(activityData.activity || []);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [id]);

  // This effect synchronizes the page with external project APIs.
  // oxlint's set-state-in-effect rule is not applicable to this async boundary.
  // oxlint-disable-next-line react(set-state-in-effect)
  useEffect(() => { void refresh(); }, [refresh]);

  async function snapshot() { setBusy(true); setError(""); try { await api(`/api/projects/${id}/versions`, { method: "POST", body: JSON.stringify({ label }) }); setLabel(""); setMessage("Version snapshot created."); await refresh(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function restore(version) { setBusy(true); setError(""); try { const editor = await api(`/api/projects/${id}/editor`); await api(`/api/projects/${id}/restore/${version.id}`, { method: "POST", body: JSON.stringify({ version: editor.editor.version }) }); setMessage(`Restored ${version.label}.`); await refresh(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function duplicate() { setBusy(true); setError(""); try { const data = await api(`/api/projects/${id}/duplicate`, { method: "POST", body: JSON.stringify({}) }); setMessage(`Project duplicated: ${data.project.title}`); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function createTemplate() { if (!templateName.trim()) return; setBusy(true); setError(""); try { await api(`/api/projects/${id}/template`, { method: "POST", body: JSON.stringify({ name: templateName }) }); setTemplateName(""); setMessage("Template saved."); await refresh(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function createReviewLink() { setBusy(true); setError(""); try { const data = await api(`/api/projects/${id}/review-links`, { method: "POST", body: JSON.stringify({}) }); setLinks((current) => [data.review, ...current]); setMessage(`Review link created: ${window.location.origin}/review/${data.review.token}`); } catch (e) { setError(e.message); } finally { setBusy(false); } }

  return <div className="hx-page"><Header right={<Link to={`/editor/${id}`} className="btn btn-ghost">Back to editor</Link>} /><main className="container" style={{ maxWidth: 1000, paddingTop: 40, paddingBottom: 64 }}>
    <p className="eyebrow">Workspace · productivity</p><h1>Versions, templates & review</h1><p>Save named editor snapshots, restore safely, duplicate projects, save reusable templates, and create read-only review links.</p>
    {error && <div role="alert" style={{ marginTop: 16 }}>{error}</div>}{message && <p style={{ marginTop: 16 }}>{message}</p>}
    <section className="hx-card" style={{ marginTop: 20, padding: 24 }}><h2>Versions</h2><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Snapshot label" /><button className="btn btn-cream" disabled={busy} onClick={snapshot}>Save snapshot</button><button className="btn btn-ghost" disabled={busy} onClick={duplicate}>Duplicate project</button></div><div style={{ display: "grid", gap: 8, marginTop: 16 }}>{versions.map((version) => <div key={version.id} style={{ border: "1px solid var(--border-color, #ddd)", borderRadius: 8, padding: 12, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}><span><strong>v{version.versionNumber}</strong> · {version.label}<br /><small>{new Date(version.createdAt).toLocaleString()}</small></span><button className="btn btn-ghost" disabled={busy} onClick={() => restore(version)}>Restore</button></div>)}{!versions.length && <p>No snapshots yet.</p>}</div></section>
    <section className="hx-card" style={{ marginTop: 16, padding: 24 }}><h2>Templates</h2><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Template name" /><button className="btn btn-cream" disabled={busy || !templateName.trim()} onClick={createTemplate}>Save current timeline</button></div><div style={{ marginTop: 16 }}>{templates.map((template) => <div key={template.id} style={{ padding: "8px 0" }}><strong>{template.name}</strong>{template.description ? ` — ${template.description}` : ""}</div>)}{!templates.length && <p>No templates yet.</p>}</div></section>
    <section className="hx-card" style={{ marginTop: 16, padding: 24 }}><h2>Review</h2><button className="btn btn-cream" disabled={busy} onClick={createReviewLink}>Create review link</button>{links.map((link) => <p key={link.id} style={{ wordBreak: "break-all" }}>{window.location.origin}/review/{link.token}</p>)}<p style={{ fontSize: 13, opacity: .7, marginTop: 12 }}>Review links expose the current editor timeline read-only and allow reviewers to leave comments. Links can be revoked from the project API.</p></section>
    <section className="hx-card" style={{ marginTop: 16, padding: 24 }}><h2>Activity</h2>{activity.map((item) => <div key={item.id} style={{ padding: "8px 0" }}><strong>{item.action}</strong><br /><small>{new Date(item.createdAt).toLocaleString()}</small></div>)}{!activity.length && <p>No activity yet.</p>}</section>
  </main></div>;
}
