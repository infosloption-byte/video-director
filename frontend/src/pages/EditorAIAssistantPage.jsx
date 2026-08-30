import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Header from "../components/Header";
import { useAuth } from "../context/AuthContext";
import "../components/ui.css";

const INTENTS = [
  { label: "Tighten pacing", instruction: "Tighten the pacing by shortening unnecessarily long video clips while preserving the story flow." },
  { label: "Improve hook", instruction: "Improve the opening hook. Make the first few seconds more compelling using safe timeline edits and, if useful, a short text overlay." },
  { label: "Clean captions", instruction: "Improve the existing captions for clarity and concise wording without changing their timing." },
  { label: "Balance audio", instruction: "Balance the editor audio levels so narration remains clear and music does not overpower it." },
  { label: "B-roll pacing", instruction: "Improve B-roll pacing by tightening or repositioning existing video clips without changing source media." },
];

function clone(value) { return JSON.parse(JSON.stringify(value)); }

export default function EditorAIAssistantPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [version, setVersion] = useState(null);
  const [instruction, setInstruction] = useState("");
  const [suggestion, setSuggestion] = useState(null);
  const [preview, setPreview] = useState(null);
  const [undoTimeline, setUndoTimeline] = useState(null);
  const [undoVersion, setUndoVersion] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;

    async function loadEditor() {
      try {
        const response = await fetch(`/api/projects/${id}/editor`, { credentials: "include", cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Unable to load editor.");
        setVersion(data.editor.version);
      } catch (loadError) {
        setError(loadError.message);
      }
    }

    void loadEditor();
  }, [id, user]);

  function chooseIntent(nextInstruction) {
    setInstruction(nextInstruction);
    setSuggestion(null);
    setPreview(null);
    setError("");
    setMessage("Intent selected. Review or edit the instruction before requesting suggestions.");
  }

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
      const currentResponse = await fetch(`/api/projects/${id}/editor`, { credentials: "include", cache: "no-store" });
      const currentData = await currentResponse.json().catch(() => ({}));
      if (!currentResponse.ok) throw new Error(currentData.error || "Unable to refresh the editor before applying.");
      if (Number(currentData.editor.version) !== Number(version)) {
        setVersion(currentData.editor.version);
        throw new Error("Editor changed elsewhere. The AI suggestion is stale; generate a new suggestion.");
      }
      const beforeTimeline = clone(currentData.editor.timeline);
      const beforeVersion = Number(currentData.editor.version);
      const response = await fetch(`/api/projects/${id}/editor/ai/apply`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: beforeVersion, operations: suggestion.operations }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to apply suggestion.");
      setUndoTimeline(beforeTimeline);
      setUndoVersion(Number(data.editor.version));
      setVersion(Number(data.editor.version));
      setMessage("AI edits applied. You can undo this AI change once before making another AI apply.");
      setPreview(null);
    } catch (applyError) { setError(applyError.message); }
    finally { setBusy(false); }
  }

  async function undoSuggestion() {
    if (!undoTimeline || undoVersion == null) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${id}/editor`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: undoVersion, timeline: undoTimeline }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to undo the AI change. Reload the editor and try again.");
      setVersion(Number(data.editor.version));
      setUndoTimeline(null);
      setUndoVersion(null);
      setSuggestion(null);
      setPreview(null);
      setMessage("AI change undone. The previous editor timeline has been restored.");
    } catch (undoError) { setError(undoError.message); }
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
          <strong>Quick editing intents</strong>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {INTENTS.map((intent) => <button key={intent.label} className="btn btn-ghost" type="button" onClick={() => chooseIntent(intent.instruction)} disabled={busy}>{intent.label}</button>)}
          </div>
        </section>

        <section className="hx-card" style={{ marginTop: 16, padding: 24 }}>
          <label htmlFor="ai-instruction"><strong>Editing instruction</strong></label>
          <textarea id="ai-instruction" value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Make the opening tighter, shorten long clips, and add a hook overlay." rows={5} style={{ width: "100%", marginTop: 12 }} />
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button className="btn btn-cream" type="button" onClick={requestSuggestion} disabled={busy || !instruction.trim()}>{busy ? "Working…" : "Suggest edits"}</button>
            {suggestion && <button className="btn btn-ghost" type="button" onClick={previewSuggestion} disabled={busy}>Preview changes</button>}
            {preview && <button className="btn btn-cream" type="button" onClick={applySuggestion} disabled={busy}>Apply changes</button>}
            {undoTimeline && <button className="btn btn-ghost" type="button" onClick={undoSuggestion} disabled={busy}>Undo AI change</button>}
          </div>
        </section>

        {error && <div role="alert" style={{ marginTop: 16 }}>{error}</div>}
        {message && <p style={{ marginTop: 16 }}>{message}</p>}

        {suggestion && (
          <section className="hx-card" style={{ marginTop: 20, padding: 24 }}>
            <h2>{suggestion.summary}</h2>
            <p>{suggestion.reasoning}</p>
            <strong>{suggestion.operations.length} proposed operation{suggestion.operations.length === 1 ? "" : "s"}</strong>
            <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
              {suggestion.operations.map((operation, index) => (
                <div key={`${operation.type}-${operation.clipId || operation.id || index}`} style={{ padding: 10, border: "1px solid var(--border-color, #ddd)", borderRadius: 8 }}>
                  <strong>{operation.type}</strong>{operation.clipId ? ` · clip ${operation.clipId}` : operation.id ? ` · ${operation.id}` : ""}
                  <pre style={{ overflowX: "auto", margin: "6px 0 0" }}>{JSON.stringify(operation, null, 2)}</pre>
                </div>
              ))}
            </div>
          </section>
        )}

        {preview && (
          <section className="hx-card" style={{ marginTop: 20, padding: 24 }}>
            <h2>Preview validated</h2>
            <p>No changes were persisted. Apply only after reviewing the proposed operations.</p>
            <p><strong>Base editor version:</strong> {preview.baseVersion}</p>
            <p><strong>Result duration:</strong> {Number(preview.timeline?.duration || 0).toFixed(3)}s</p>
          </section>
        )}

        <p style={{ marginTop: 24, fontSize: 13, opacity: 0.75 }}>Current editor version: {version ?? "loading…"}</p>
        <p style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>AI changes operate only on the saved editor timeline. Source media and Storyboard data remain unchanged.</p>
      </main>
    </div>
  );
}
