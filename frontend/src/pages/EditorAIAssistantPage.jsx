import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Header from "../components/Header";
import { useAuth } from "../context/AuthContext";
import "../components/ui.css";

export default function EditorAIAssistantPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [version, setVersion] = useState(null);
  const [instruction, setInstruction] = useState("");
  const [suggestion, setSuggestion] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    fetch(`/api/projects/${id}/editor`, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Unable to load editor.");
        setVersion(data.editor.version);
      })
      .catch((loadError) => setError(loadError.message));
  }, [id, user]);

  async function requestSuggestion() {
    setBusy(true); setError(""); setMessage(""); setSuggestion(null); setPreview(null);
    try {
      const response = await fetch(`/api/projects/${id}/editor/ai/suggest`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instruction }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to generate suggestions.");
      setVersion(data.baseVersion); setSuggestion(data); setMessage("Suggestion ready. Preview it before applying.");
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function previewSuggestion() {
    if (!suggestion) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${id}/editor/ai/preview`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operations: suggestion.operations }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to preview suggestion.");
      setVersion(data.baseVersion); setPreview(data); setMessage("Preview validated. Nothing has been saved.");
    } catch (previewError) { setError(previewError.message); }
    finally { setBusy(false); }
  }

  async function applySuggestion() {
    if (!suggestion || version == null) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${id}/editor/ai/apply`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version, operations: suggestion.operations }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to apply suggestion.");
      setVersion(data.editor.version); setMessage("AI edits applied and saved to the independent editor timeline."); setPreview(null);
    } catch (applyError) { setError(applyError.message); }
    finally { setBusy(false); }
  }

  if (!user) return null;
  return (
    <div className="hx-page">
      <Header right={<Link to={`/editor/${id}`} className="btn btn-ghost">Back to editor</Link>} />
      <main className="container" style={{ maxWidth: 900, paddingTop: 48, paddingBottom: 64 }}>
        <p className="eyebrow">Advanced editor · AI assistant</p>
        <h1>What should Helix change?</h1>
        <p>AI suggestions are converted into validated, reversible editor operations. Source Storyboard and media records are never edited.</p>
        <section className="hx-card" style={{ marginTop: 24, padding: 24 }}>
          <label htmlFor="ai-instruction"><strong>Editing instruction</strong></label>
          <textarea id="ai-instruction" value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Make the opening tighter, shorten long clips, and add a hook overlay." rows={5} style={{ width: "100%", marginTop: 12 }} />
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button className="btn btn-cream" type="button" onClick={requestSuggestion} disabled={busy || !instruction.trim()}>{busy ? "Working…" : "Suggest edits"}</button>
            {suggestion && <button className="btn btn-ghost" type="button" onClick={previewSuggestion} disabled={busy}>Preview changes</button>}
            {preview && <button className="btn btn-cream" type="button" onClick={applySuggestion} disabled={busy}>Apply changes</button>}
          </div>
        </section>

        {error && <div role="alert" style={{ marginTop: 16 }}>{error}</div>}
        {message && <p style={{ marginTop: 16 }}>{message}</p>}

        {suggestion && (
          <section className="hx-card" style={{ marginTop: 20, padding: 24 }}>
            <h2>{suggestion.summary}</h2>
            <p>{suggestion.reasoning}</p>
            <strong>{suggestion.operations.length} proposed operation{suggestion.operations.length === 1 ? "" : "s"}</strong>
            <pre style={{ overflowX: "auto", marginTop: 12 }}>{JSON.stringify(suggestion.operations, null, 2)}</pre>
          </section>
        )}

        {preview && (
          <section className="hx-card" style={{ marginTop: 20, padding: 24 }}>
            <h2>Preview validated</h2>
            <p>No changes were persisted. Apply only after reviewing the proposed operations.</p>
            <p><strong>Base editor version:</strong> {preview.baseVersion}</p>
          </section>
        )}

        <p style={{ marginTop: 24, fontSize: 13, opacity: 0.75 }}>Current editor version: {version ?? "loading…"}</p>
      </main>
    </div>
  );
}
