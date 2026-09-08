import { useEffect, useMemo, useState } from "react";
import "./ResearchTrust.css";

function SourceLink({ source }) {
  if (!source?.url) return null;
  return <a href={source.url} target="_blank" rel="noreferrer">Open source ↗</a>;
}

function sourceForEvidence(evidence, sources) {
  return sources.find((source) => source.id === evidence?.sourceId) || null;
}

function normalizeStatus(value) {
  return String(value || "unverified").trim().toLowerCase().replace(/\s+/g, "_");
}

function statusLabel(status) {
  return status.replaceAll("_", " ");
}

function metricValue(item, ...keys) {
  for (const key of keys) {
    if (item?.[key] !== undefined && item?.[key] !== null && item?.[key] !== "") return Number(item[key]);
  }
  return null;
}

function metricLabel(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return "Not scored";
  if (score >= 85) return "High";
  if (score >= 70) return "Strong";
  if (score >= 50) return "Moderate";
  return "Limited";
}

function metricText(value) {
  const score = Number(value);
  return Number.isFinite(score) ? `${score}%` : "—";
}

function evidenceStrength({ hasEvidence, evidenceCount, sourceCount, status }) {
  if (!hasEvidence) return { label: "No direct passage", detail: "Treat the finding as unverified." };
  if (["corroborated", "verified"].includes(status)) return { label: "Corroborated", detail: `${sourceCount || 1} linked source${sourceCount === 1 ? "" : "s"} support the verified claim.` };
  if (evidenceCount > 1) return { label: "Multiple passages", detail: `${evidenceCount} exact passages are linked to the finding.` };
  return { label: "Passage linked", detail: "An exact source passage is available for inspection." };
}

function SourceTrustMetrics({ source }) {
  const metrics = [
    ["Authority", metricValue(source, "authorityScore", "authority_score", "authority")],
    ["Evidence quality", metricValue(source, "evidenceScore", "evidence_score", "evidenceQuality", "evidence_quality")],
    ["Relevance", metricValue(source, "relevanceScore", "relevance_score", "relevance")],
    ["Recency", metricValue(source, "recencyScore", "recency_score", "recency")],
    ["Independence", metricValue(source, "independenceScore", "independence_score", "independence")],
    ["Transparency", metricValue(source, "transparencyScore", "transparency_score", "transparency")],
  ];
  return (
    <dl className="research-trust__metric-grid">
      {metrics.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{metricText(value)}</dd>
          <span>{metricLabel(value)}</span>
        </div>
      ))}
    </dl>
  );
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

  const rawStatus = claim?.verificationStatus || claim?.verification_status || null;
  const status = normalizeStatus(rawStatus || finding?.evidence_level);
  const hasVerificationRecord = Boolean(rawStatus);
  const hasEvidence = evidence.length > 0;
  const verifiedConfidence = hasVerificationRecord ? Number(claim?.verifiedConfidence ?? 0) : null;
  const modelConfidence = Number(claim?.modelConfidence ?? finding?.confidence ?? 0);
  const evidenceSources = [...new Set(evidence.map((item) => item.sourceId).filter(Boolean))];
  const evidenceSourceCount = evidenceSources.length;
  const evidenceState = evidenceStrength({ hasEvidence, evidenceCount: evidence.length, sourceCount: evidenceSourceCount, status });
  const trustLabel = hasVerificationRecord ? statusLabel(status) : hasEvidence ? "Evidence linked · verification not established" : "Unverified";
  const selectedSources = comparableSources.filter((source) => selectedSourceIds.includes(source.id));
  const verificationDisplay = hasVerificationRecord ? statusLabel(status) : "Not established";

  const toggleSource = (sourceId) => {
    setSelectedSourceIds((current) => current.includes(sourceId)
      ? current.filter((id) => id !== sourceId)
      : current.length >= 2 ? [...current.slice(1), sourceId] : [...current, sourceId]);
  };

  return (
    <aside className="research-brief__evidence-inspector research-trust" aria-labelledby="research-evidence-inspector-title">
      <div className="research-brief__inspector-head">
        <div><p className="eyebrow">Evidence inspection</p><h3 id="research-evidence-inspector-title">How this finding is supported</h3></div>
        <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close evidence inspection">Close</button>
      </div>

      <div className={`research-trust__claim research-trust__claim--${status}`}>
        <div className="research-trust__claim-status">
          <span>Verification</span>
          <strong>{verificationDisplay}</strong>
        </div>
        <div>
          <span className="research-brief__level">{finding?.evidence_level || "unverified"}</span>
          <strong className="research-trust__claim-text">{finding?.claim || claim?.claimText || "Finding unavailable"}</strong>
          <p className="research-brief__trust-note">{trustLabel}{evidenceSourceCount > 0 ? ` · ${evidenceSourceCount} source${evidenceSourceCount === 1 ? "" : "s"} linked` : ""}</p>
        </div>
      </div>

      <div className="research-trust__confidence-grid" aria-label="Finding trust summary">
        <div className="research-trust__confidence-card research-trust__confidence-card--primary">
          <span>Verification confidence</span>
          <strong>{hasVerificationRecord ? `${verifiedConfidence}%` : "—"}</strong>
          <small>{hasVerificationRecord ? "persisted verification" : "not established"}</small>
        </div>
        <div className="research-trust__confidence-card">
          <span>Model confidence</span>
          <strong>{Number.isFinite(modelConfidence) ? `${modelConfidence}%` : "—"}</strong>
          <small>model estimate only</small>
        </div>
        <div className="research-trust__confidence-card">
          <span>Evidence strength</span>
          <strong>{evidenceState.label}</strong>
          <small>{evidenceState.detail}</small>
        </div>
      </div>

      <section className="research-trust__evidence-boundary" aria-label="Evidence boundary">
        <span className="research-trust__boundary-dot" aria-hidden="true" />
        <div><strong>{hasEvidence ? `${evidence.length} exact passage${evidence.length === 1 ? "" : "s"} linked` : "No exact passage linked"}</strong><span>{hasEvidence ? "The finding can be traced into persisted source text." : "This claim must not be read as established fact."}</span></div>
      </section>

      <section>
        <h4>Exact supporting passages</h4>
        {hasEvidence ? <div className="research-brief__evidence-list">{evidence.map((item) => {
          const source = sourceForEvidence(item, sources);
          return <article key={item.id}><blockquote>{item.passageText}</blockquote><small>{source?.title || source?.publisher || "Source"} · {item.locator || `chars:${item.startOffset ?? "?"}-${item.endOffset ?? "?"}`}</small></article>;
        })}</div> : <p className="research-brief__inspector-empty">No exact source passage is linked to this finding. Treat the claim as unverified.</p>}
      </section>

      {comparableSources.length > 0 && <section>
        <div className="research-brief__compare-head"><div><h4>Compare source quality</h4><p>Compare the six trust dimensions without collapsing them into one score.</p></div><span>{selectedSources.length}/2</span></div>
        <div className="research-brief__source-selector">{comparableSources.map((source) => <button type="button" key={source.id} className={`research-brief__source-chip${selectedSourceIds.includes(source.id) ? " research-brief__source-chip--selected" : ""}`} onClick={() => toggleSource(source.id)} aria-pressed={selectedSourceIds.includes(source.id)}>{source.title || source.publisher || source.sourceClass || "Source"}</button>)}</div>
        <div className="research-brief__source-compare">{selectedSources.map((source) => {
          const sourceEvidence = evidence.filter((item) => item.sourceId === source.id);
          const readStatus = String(source.readStatus || source.read_status || "unknown").replaceAll("_", " ");
          const unread = ["unknown", "failed", "http 403", "http 404", "empty", "non text"].includes(readStatus.toLowerCase());
          return <article key={source.id} className={`research-brief__compare-card${unread ? " research-trust__compare-card--unread" : ""}`}>
            <div><strong>{source.title || source.publisher || "Source"}</strong><small>{source.sourceClass || source.reliability || "source"} · {readStatus}</small></div>
            {unread && <p className="research-trust__unread-note">Not fully readable — this source is not verification evidence.</p>}
            <SourceTrustMetrics source={source} />
            {sourceEvidence.length > 0 ? sourceEvidence.slice(0, 2).map((item) => <blockquote key={item.id}>{item.passageText}</blockquote>) : <p>{source.readExcerpt || "No linked passage available."}</p>}
            <SourceLink source={source} />
          </article>;
        })}</div>
      </section>}
    </aside>
  );
}
