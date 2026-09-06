import { useEffect, useState } from "react";

function Metric({ label, value }) { return <div><strong>{value ?? 0}</strong><span>{label}</span></div>; }

export default function ResearchWorkspacePanels({ projectId, conflicts = [], onRefresh }) {
  const [metrics, setMetrics] = useState(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(null);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/research/metrics`, { cache: "no-store" })
      .then(async (response) => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Metrics unavailable."); if (!cancelled) setMetrics(data.metrics || null); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [projectId]);

  async function askQuestion(event) {
    event.preventDefault(); const value = question.trim(); if (!value || busy) return;
    setBusy(true); setError("");
    try { const response = await fetch(`/api/projects/${projectId}/research/follow-up`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: value }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Follow-up failed."); setAnswer(data); setQuestion(""); }
    catch (err) { setError(err.message || "Follow-up failed."); } finally { setBusy(false); }
  }

  async function runAction(url, body, label) {
    setAction(label); setError("");
    try { const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `${label} failed.`); onRefresh?.(); return data; }
    catch (err) { setError(err.message || `${label} failed.`); return null; } finally { setAction(""); }
  }

  async function resolveConflict(conflictId, status) {
    setResolving(conflictId); setError("");
    try { const response = await fetch(`/api/projects/${projectId}/research/conflicts/${conflictId}/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, resolution: status === "adjudicated" ? "Reviewed in the Research workspace; retain the winning position while keeping opposing evidence visible." : "Reviewed in the Research workspace; evidence remains inconclusive." }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Conflict update failed."); onRefresh?.(); }
    catch (err) { setError(err.message || "Conflict update failed."); } finally { setResolving(null); }
  }

  return <div className="research-brief__workspace-panels">
    {metrics && <section className="research-brief__panel"><div className="research-brief__section-head"><div><p className="eyebrow">Research health</p><h3>Corpus & provenance metrics</h3></div></div><div className="research-brief__metrics research-brief__metrics--workspace"><Metric label="Sources" value={metrics.sources} /><Metric label="Readable" value={metrics.readableSources} /><Metric label="Evidence" value={metrics.evidencePassages} /><Metric label="Claims" value={metrics.claims} /><Metric label="Traceable" value={metrics.traceableClaims} /><Metric label="Corroborated" value={metrics.corroboratedClaims} /><Metric label="Conflicts" value={metrics.conflicts} /><Metric label="Unresolved" value={metrics.unresolvedConflicts} /></div></section>}

    <section className="research-brief__panel"><div className="research-brief__section-head"><div><p className="eyebrow">Research memory</p><h3>Ask the stored evidence</h3></div></div><form className="research-brief__followup" onSubmit={askQuestion}><input aria-label="Research follow-up question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question grounded in this corpus…" /><button className="btn btn-cream" type="submit" disabled={busy || !question.trim()}>{busy ? "Checking…" : "Ask"}</button></form>{answer && <article className="research-brief__followup-answer"><strong>{answer.grounded ? "Grounded in persisted research" : "Not established by this corpus"}</strong><p>{answer.answer}</p>{answer.evidence?.map((item) => <blockquote key={item.id}>{item.passageText}<small>{item.locator || `evidence ${Number(item.evidenceIndex) + 1}`}</small></blockquote>)}</article>}</section>

    <section className="research-brief__panel"><div className="research-brief__section-head"><div><p className="eyebrow">Research iteration</p><h3>Refresh without losing prior corpus</h3></div></div><form className="research-brief__rerun" onSubmit={(event) => { event.preventDefault(); void runAction(`/api/projects/${projectId}/research/rerun`, { focus: focus.trim() }, "Focused rerun"); }}><input aria-label="Focused rerun topic" value={focus} onChange={(event) => setFocus(event.target.value)} placeholder="Optional focus, e.g. limitations or latest evidence" /><button className="btn btn-ghost" type="submit" disabled={Boolean(action)}>{action === "Focused rerun" ? "Rerunning…" : "Run focused rerun"}</button></form><button className="btn btn-ghost" type="button" disabled={Boolean(action)} onClick={() => void runAction(`/api/projects/${projectId}/research/regenerate`, {}, "Brief regeneration")}>{action === "Brief regeneration" ? "Regenerating…" : "Regenerate brief from stored corpus"}</button></section>

    {conflicts.length > 0 && <section className="research-brief__panel"><div className="research-brief__section-head"><div><p className="eyebrow">Evidence resolution</p><h3>Review contradiction cases</h3></div><span>{conflicts.length} cases</span></div><div className="research-brief__conflict-list">{conflicts.map((conflict) => <article key={conflict.id}><div><span className="research-brief__verification">{conflict.status}</span><strong>{conflict.overlapScore}% overlap</strong></div><p>{conflict.reason}</p>{conflict.resolution && <small>{conflict.resolution}</small>}<div className="research-brief__conflict-actions"><button type="button" className="btn btn-ghost" disabled={resolving === conflict.id} onClick={() => resolveConflict(conflict.id, "unresolved")}>Keep unresolved</button><button type="button" className="btn btn-cream" disabled={resolving === conflict.id} onClick={() => resolveConflict(conflict.id, "adjudicated")}>Mark adjudicated</button></div></article>)}</div></section>}
    {error && <p className="research-brief__workspace-error">{error}</p>}
  </div>;
}
