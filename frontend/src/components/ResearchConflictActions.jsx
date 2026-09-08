import { useEffect, useState } from "react";

function unresolved(conflict) {
  return String(conflict?.status || "").toLowerCase() !== "adjudicated";
}

export default function ResearchConflictActions({ projectId }) {
  const [conflicts, setConflicts] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [resolution, setResolution] = useState("");
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const response = await fetch(`/api/projects/${projectId}/research/graph`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || stopped) return;
        setConflicts(Array.isArray(data.session?.conflicts) ? data.session.conflicts.filter(unresolved) : []);
      } catch {
        // The full report already has its own graph loading/retry state.
      }
    }
    if (projectId) void load();
    return () => { stopped = true; };
  }, [projectId]);

  async function resolveConflict(conflictId, status) {
    const trimmed = resolution.trim();
    if (!trimmed || !conflictId || busyId) return;
    setBusyId(conflictId);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/research/conflicts/${conflictId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, resolution: trimmed }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to update the research conflict.");
      setConflicts((items) => items.filter((item) => item.id !== conflictId));
      setOpenId(null);
      setResolution("");
      setMessage(status === "adjudicated" ? "Conflict marked adjudicated and saved." : "Conflict remains unresolved and the note was saved.");
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setMessage(error.message || "Failed to update the research conflict.");
    } finally {
      setBusyId("");
    }
  }

  if (!conflicts.length && !message) return null;

  return (
    <section className="research-conflict-actions" aria-labelledby="research-conflict-actions-title">
      <div className="research-conflict-actions__head">
        <div><p className="eyebrow">Integrity review</p><h2 id="research-conflict-actions-title">Unresolved evidence</h2></div>
        {conflicts.length > 0 && <span>{conflicts.length} open</span>}
      </div>
      <p className="research-conflict-actions__intro">Review open evidence conflicts without changing the underlying source text or research corpus.</p>
      {conflicts.map((conflict) => (
        <article className="research-conflict-actions__item" key={conflict.id}>
          <div className="research-conflict-actions__item-head"><strong>{conflict.reason || "Evidence conflict"}</strong><span>{conflict.overlapScore != null ? `${conflict.overlapScore}% overlap` : "Review needed"}</span></div>
          {conflict.resolution && <p>{conflict.resolution}</p>}
          {openId === conflict.id ? (
            <form onSubmit={(event) => { event.preventDefault(); void resolveConflict(conflict.id, "adjudicated"); }}>
              <label htmlFor={`conflict-resolution-${conflict.id}`}>Review note</label>
              <textarea id={`conflict-resolution-${conflict.id}`} value={resolution} onChange={(event) => setResolution(event.target.value)} maxLength={10000} rows={3} placeholder="Explain how the available evidence should be treated." disabled={busyId === conflict.id} />
              <div><button className="btn btn-cream" type="submit" disabled={busyId === conflict.id || !resolution.trim()}>{busyId === conflict.id ? "Saving…" : "Mark adjudicated"}</button><button className="btn btn-ghost" type="button" onClick={() => { setOpenId(null); setResolution(""); }} disabled={busyId === conflict.id}>Cancel</button></div>
              <button className="research-conflict-actions__keep-open" type="button" onClick={() => void resolveConflict(conflict.id, "unresolved")} disabled={busyId === conflict.id || !resolution.trim()}>Save note, keep unresolved</button>
            </form>
          ) : (
            <button className="btn btn-ghost" type="button" onClick={() => { setOpenId(conflict.id); setResolution(conflict.resolution || ""); setMessage(""); }}>Review conflict</button>
          )}
        </article>
      ))}
      {message && <p className="research-conflict-actions__message" role="status">{message}</p>}
    </section>
  );
}
