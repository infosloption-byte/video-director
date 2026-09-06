import { useEffect, useMemo, useState } from "react";

function SourceLink({ source }) {
  if (!source?.url) return null;
  return <a href={source.url} target="_blank" rel="noreferrer">Open source ↗</a>;
}

function sourceForEvidence(evidence, sources) {
  return sources.find((source) => source.id === evidence?.sourceId) || null;
}

export default function ResearchFindingInspector({ finding, claim, evidence = [], sources = [], onClose }) {
  const comparableSources = useMemo(() => sources.filter(Boolean), [sources]);
  const [selectedSourceIds, setSelectedSourceIds] = useState(() => comparableSources.slice(0, 2).map((source) => source.id));

  useEffect(() => {
    setSelectedSourceIds(comparableSources.slice(0, 2).map((source) => source.id));
  }, [finding, comparableSources]);

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const verifiedConfidence = Number(claim?.verifiedConfidence ?? finding?.confidence ?? 0);
  const modelConfidence = Number(claim?.modelConfidence ?? finding?.confidence ?? 0);
  const status = claim?.verificationStatus || claim?.verification_status || finding?.evidence_level || "unverified";
  const selectedSources = comparableSources.filter((source) => selectedSourceIds.includes(source.id));

  const toggleSource = (sourceId) => {
    setSelectedSourceIds((current) => current.includes(sourceId)
      ? current.filter((id) => id !== sourceId)
      : current.length >= 2 ? [...current.slice(1), sourceId] : [...current, sourceId]);
  };

  return (
    <aside className="research-brief__evidence-inspector" aria-labelledby="research-evidence-inspector-title">
      <div className="research-brief__inspector-head">
        <div><p className="eyebrow">Evidence inspection</p><h3 id="research-evidence-inspector-title">Why this finding is trusted</h3></div>
        <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close evidence inspection">Close</button>
      </div>
      <div className="research-brief__inspector-claim"><span className="research-brief__level">{finding?.evidence_level || "unverified"}</span><strong>{finding?.claim || claim?.claimText}</strong></div>
      <div className="research-brief__confidence-summary"><div><strong>{verifiedConfidence}%</strong><span>verified confidence</span></div><div><strong>{modelConfidence}%</strong><span>model confidence</span></div><div><strong>{evidence.length}</strong><span>evidence passages</span></div></div>
      <span className={`research-brief__verification research-brief__verification--${status}`}>{status.replaceAll("_", " ")}</span>

      <section>
        <h4>Exact supporting passages</h4>
        {evidence.length > 0 ? <div className="research-brief__evidence-list">{evidence.map((item) => {
          const source = sourceForEvidence(item, sources);
          return <article key={item.id}><blockquote>{item.passageText}</blockquote><small>{source?.title || source?.publisher || "Source"} · {item.locator || `chars:${item.startOffset ?? "?"}-${item.endOffset ?? "?"}`}</small></article>;
        })}</div> : <p className="research-brief__inspector-empty">No exact source passage was linked to this finding.</p>}
      </section>

      {comparableSources.length > 0 && <section>
        <div className="research-brief__compare-head"><div><h4>Compare sources</h4><p>Select up to two sources to compare authority, read status, and supporting text.</p></div><span>{selectedSources.length}/2</span></div>
        <div className="research-brief__source-selector">{comparableSources.map((source) => <button type="button" key={source.id} className={`research-brief__source-chip${selectedSourceIds.includes(source.id) ? " research-brief__source-chip--selected" : ""}`} onClick={() => toggleSource(source.id)} aria-pressed={selectedSourceIds.includes(source.id)}>{source.title || source.publisher || source.sourceClass || "Source"}</button>)}</div>
        <div className="research-brief__source-compare">{selectedSources.map((source) => {
          const sourceEvidence = evidence.filter((item) => item.sourceId === source.id);
          return <article key={source.id} className="research-brief__compare-card"><div><strong>{source.title || source.publisher || "Source"}</strong><small>{source.sourceClass || source.reliability || "source"} · {source.readStatus}</small></div><dl><div><dt>Authority</dt><dd>{source.authorityScore ?? 0}%</dd></div><div><dt>Relevance</dt><dd>{source.relevanceScore ?? 0}%</dd></div><div><dt>Evidence</dt><dd>{source.evidenceScore ?? 0}%</dd></div></dl>{sourceEvidence.length > 0 ? sourceEvidence.slice(0, 2).map((item) => <blockquote key={item.id}>{item.passageText}</blockquote>) : <p>{source.readExcerpt || "No linked passage available."}</p>}<SourceLink source={source} /></article>;
        })}</div>
      </section>}
    </aside>
  );
}
