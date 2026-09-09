import { useCallback, useEffect, useState } from "react";
import ResearchFindingInspector from "./ResearchFindingInspector";
import ResearchAssistantPanel from "./ResearchAssistantPanel";
import "./ResearchAssistantPanel.css";
import "../pages/ResearchStageUX.css";

function SourceLink({ source }) {
  if (!source?.url) return null;
  return <a href={source.url} target="_blank" rel="noreferrer">Open source ↗</a>;
}

function normalizeClaimText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function sourceAssessmentMap(items = []) {
  return new Map(items.map((item) => [Number(item.source_index), item]));
}

function humanize(value) {
  return String(value || "unknown").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function scoreLabel(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  if (score >= 85) return "High";
  if (score >= 70) return "Strong";
  if (score >= 50) return "Moderate";
  return "Limited";
}

function findingConfidence(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return "Not established";
  if (score >= 85) return "High confidence";
  if (score >= 70) return "Good confidence";
  if (score >= 50) return "Mixed confidence";
  return "Low confidence";
}

export default function ResearchReport({ projectId, project, onContinueSetup }) {
  const [graph, setGraph] = useState(null);
  const [graphError, setGraphError] = useState("");
  const [graphLoading, setGraphLoading] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [assistantOpen, setAssistantOpen] = useState(false);

  const loadGraph = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/research/graph`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Failed to load saved evidence details.");
    setGraph(data.session || null);
  }, [projectId]);

  const retryGraph = useCallback(async () => {
    if (graphLoading) return;
    setGraphLoading(true);
    setGraphError("");
    try {
      await loadGraph();
    } catch (error) {
      setGraphError(error.message || "Failed to load saved evidence details.");
    } finally {
      setGraphLoading(false);
    }
  }, [graphLoading, loadGraph]);

  useEffect(() => {
    let stopped = false;
    let timer = null;
    let attempt = 0;

    async function loadGraphWithRetry() {
      setGraphLoading(true);
      try {
        await loadGraph();
        if (!stopped) setGraphError("");
      } catch (error) {
        if (stopped) return;
        attempt += 1;
        if (attempt <= 5) {
          timer = window.setTimeout(loadGraphWithRetry, 800);
        } else {
          setGraphError(error.message || "Failed to load saved evidence details.");
        }
      } finally {
        if (!stopped) setGraphLoading(false);
      }
    }

    if (project?.researchStatus === "ready") void loadGraphWithRetry();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [loadGraph, project?.researchStatus]);

  const research = project?.research;
  const deep = research?.sources && typeof research.sources === "object" && !Array.isArray(research.sources)
    ? research.sources
    : (research?.deepResearch || {});
  const findings = Array.isArray(deep.key_findings) ? deep.key_findings : [];
  const numbers = Array.isArray(deep.important_numbers) ? deep.important_numbers : [];
  const disagreements = Array.isArray(deep.disagreements) ? deep.disagreements : [];
  const gaps = Array.isArray(deep.knowledge_gaps) ? deep.knowledge_gaps : [];
  const safeClaims = Array.isArray(deep.safe_claims) ? deep.safe_claims : [];
  const avoidClaims = Array.isArray(deep.claims_to_avoid) ? deep.claims_to_avoid : [];
  const opportunities = Array.isArray(deep.creative_opportunities) ? deep.creative_opportunities : [];
  const reliability = deep.reliability_assessment;
  const verifiedClaims = graph?.claims || [];
  const graphSources = graph?.sources || [];
  const graphEvidence = graph?.evidence || [];
  const graphConflicts = graph?.conflicts || [];
  const sourceAssessments = sourceAssessmentMap(deep.source_assessments || []);
  const fallbackSources = Array.isArray(research?.sources?.sources)
    ? research.sources.sources.map((source, index) => ({
      id: `${source.url || source.title || "source"}-${index}`,
      sourceIndex: source.index ?? index,
      title: source.title,
      publisher: source.publisher,
      sourceClass: source.source_class,
      readStatus: source.read_status,
      authorityScore: source.quality_prior,
      url: source.url,
      readExcerpt: source.read_excerpt,
    }))
    : [];
  const sources = graphSources.length > 0 ? graphSources : fallbackSources;
  const metrics = deep.research_metrics || {};
  const discoveredCount = Number.isFinite(Number(metrics.discovered_sources)) ? Number(metrics.discovered_sources) : sources.length;
  const reviewedCount = Number.isFinite(Number(metrics.sources_read)) ? Number(metrics.sources_read) : sources.filter((source) => ["read", "success", "completed"].includes(source.readStatus)).length;
  const evidenceCount = Number.isFinite(Number(metrics.evidence_passages)) ? Number(metrics.evidence_passages) : graphEvidence.length;
  const claimsCount = Number.isFinite(Number(metrics.claims_checked)) ? Number(metrics.claims_checked) : verifiedClaims.length;
  const unresolvedCount = graphConflicts.filter((item) => String(item.status || "").toLowerCase() === "unresolved").length;
  const conflictCount = Math.max(graphConflicts.length, disagreements.length);
  const inspectedClaim = selectedFinding
    ? verifiedClaims.find((claim) => normalizeClaimText(claim.claimText) === normalizeClaimText(selectedFinding.claim))
    : null;
  const selectedEvidence = !selectedFinding
    ? []
    : inspectedClaim?.evidenceLinks?.length
      ? inspectedClaim.evidenceLinks.map((link) => link.evidence).filter(Boolean)
      : (selectedFinding.evidence_indexes || [])
        .map((index) => graphEvidence.find((item) => Number(item.evidenceIndex) === Number(index)))
        .filter(Boolean);
  const selectedSources = !selectedFinding
    ? []
    : inspectedClaim?.sourceLinks?.length
      ? inspectedClaim.sourceLinks.map((link) => link.source).filter(Boolean)
      : (selectedFinding.source_indexes || [])
        .map((index) => sources.find((source) => Number(source.sourceIndex) === Number(index)))
        .filter(Boolean);

  if (!project) return null;

  return (
    <>
      <section className="research-report" aria-labelledby="research-report-title">
        <header className="research-report__hero">
          <div className="research-report__hero-copy">
            <p className="eyebrow">Research complete</p>
            <h2 id="research-report-title">{project.title || "Research report"}</h2>
            <p>Helix reviewed the selected signal across multiple research areas, read source material, checked evidence, and assembled the report below.</p>
            <div className="research-report__hero-meta">
              <span>{discoveredCount} sources found</span>
              <span>{reviewedCount} sources reviewed</span>
              <span>{evidenceCount} evidence passages</span>
              <span>{findings.length || claimsCount} key findings</span>
            </div>
          </div>
          <div className="research-report__hero-actions">
            {reliability && <div className="research-report__confidence"><strong>{reliability.overall_score}%</strong><span>{reliability.label || "Overall"} confidence</span></div>}
            <button type="button" className="btn btn-ghost" onClick={() => setAssistantOpen(true)} aria-expanded={assistantOpen}>Ask Helix</button>
          </div>
        </header>

        {graphError && <aside className="research-report__alert research-report__alert--warning" role="status"><div><strong>Research is ready, but detailed evidence is still loading.</strong><span>The main report remains available. Source passages and verification details can appear after the saved research graph finishes loading.</span></div><button type="button" className="btn btn-ghost" onClick={() => void retryGraph()} disabled={graphLoading}>{graphLoading ? "Loading evidence…" : "Retry evidence"}</button></aside>}

        <section className="research-report__section research-report__section--summary" id="summary" aria-labelledby="summary-title">
          <div className="research-report__section-intro"><p className="eyebrow">The research</p><h3 id="summary-title">What Helix found</h3></div>
          <div className="research-report__summary-copy">
            {deep.executive_summary && <p className="research-report__lead">{deep.executive_summary}</p>}
            {deep.what_happened && <div><h4>What happened</h4><p>{deep.what_happened}</p></div>}
            {deep.why_it_matters && <div><h4>Why it matters</h4><p>{deep.why_it_matters}</p></div>}
            {deep.mechanism && <div><h4>How it works</h4><p>{deep.mechanism}</p></div>}
            {!deep.executive_summary && !deep.what_happened && !deep.why_it_matters && !deep.mechanism && <p className="research-report__muted">The saved brief did not return a prose synthesis for this run.</p>}
          </div>
        </section>

        <section className="research-report__section" id="findings" aria-labelledby="findings-title">
          <div className="research-report__section-head"><div><p className="eyebrow">Evidence-backed findings</p><h3 id="findings-title">What the research supports</h3></div><span>{findings.length} findings</span></div>
          {findings.length > 0 ? <div className="research-report__findings">{findings.map((item, index) => {
            const claim = verifiedClaims.find((candidate) => normalizeClaimText(candidate.claimText) === normalizeClaimText(item.claim));
            const confidence = Number(claim?.verifiedConfidence ?? item.confidence ?? NaN);
            const evidenceLinks = claim?.evidenceLinks?.length ?? item.evidence_indexes?.length ?? 0;
            const sourceLinks = claim?.sourceLinks?.length ?? item.source_indexes?.length ?? 0;
            const verificationStatus = claim?.verificationStatus || claim?.verification_status || (evidenceLinks > 0 ? "evidence linked" : "unverified");
            return <article className="research-report__finding" key={`${item.claim}-${index}`}><div className="research-report__finding-index">{String(index + 1).padStart(2, "0")}</div><div className="research-report__finding-body"><div className="research-report__finding-topline"><span className="research-report__badge">{humanize(item.evidence_level || "unverified")}</span><span className={`research-report__verification research-report__verification--${String(verificationStatus).replaceAll(" ", "_")}`}>{humanize(verificationStatus)}</span></div><h4>{item.claim}</h4><p>{item.evidence}</p><div className="research-report__finding-meta"><span>{findingConfidence(confidence)}</span>{evidenceLinks > 0 && <span>{evidenceLinks} supporting passage{evidenceLinks === 1 ? "" : "s"}</span>}{sourceLinks > 0 && <span>{sourceLinks} source{sourceLinks === 1 ? "" : "s"}</span>}<button type="button" className="research-report__text-button" onClick={() => setSelectedFinding(item)}>See supporting evidence →</button></div></div></article>;
          })}</div> : <div className="research-report__empty"><strong>No key findings were returned.</strong><span>The saved research report did not contain structured findings for this run.</span></div>}
        </section>

        {numbers.length > 0 && <section className="research-report__section" id="numbers" aria-labelledby="numbers-title"><div className="research-report__section-head"><div><p className="eyebrow">Data points</p><h3 id="numbers-title">Important numbers</h3></div><span>{numbers.length} reported</span></div><div className="research-report__numbers">{numbers.map((item, index) => <article key={`${item.value}-${index}`}><strong>{item.value}</strong><p>{item.context}</p></article>)}</div></section>}

        <section className="research-report__section" id="sources" aria-labelledby="sources-title">
          <div className="research-report__section-head"><div><p className="eyebrow">Source trail</p><h3 id="sources-title">Where Helix looked</h3></div><span>{discoveredCount} found · {reviewedCount} reviewed</span></div>
          <div className="research-report__coverage"><div><strong>{discoveredCount}</strong><span>Sources found</span></div><div><strong>{reviewedCount}</strong><span>Successfully reviewed</span></div><div><strong>{Math.max(0, discoveredCount - reviewedCount)}</strong><span>Not fully reviewed</span></div></div>
          {sources.length > 0 ? <div className="research-report__sources">{sources.map((source, index) => {
            const sourceIndex = Number(source.sourceIndex ?? source.index ?? index);
            const assessment = sourceAssessments.get(sourceIndex);
            const status = source.readStatus || source.read_status || "unknown";
            const authority = assessment?.authority ?? source.authorityScore ?? source.quality_prior;
            const relevance = assessment?.relevance ?? source.relevanceScore;
            const evidenceQuality = assessment?.evidence_quality ?? source.evidenceScore;
            const excerpt = source.readExcerpt || source.read_excerpt;
            return <details className="research-report__source" key={source.id || `${source.url}-${index}`}><summary><div className="research-report__source-title"><strong>{source.title || source.publisher || "Source"}</strong><span>{source.sourceClass || source.source_class || "Web source"}</span></div><div className="research-report__source-state"><span className={`research-report__status research-report__status--${String(status).replaceAll("_", "-")}`}>{humanize(status)}</span><span>{scoreLabel(authority) ? `${scoreLabel(authority)} authority` : "Authority not scored"}</span></div><span className="research-report__source-chevron" aria-hidden="true">+</span></summary><div className="research-report__source-detail"><div className="research-report__source-detail-meta">{scoreLabel(authority) && <span>{scoreLabel(authority)} authority</span>}{scoreLabel(relevance) && <span>{scoreLabel(relevance)} relevance</span>}{scoreLabel(evidenceQuality) && <span>{scoreLabel(evidenceQuality)} evidence quality</span>}</div>{excerpt ? <blockquote>{excerpt}</blockquote> : status === "read" || status === "success" ? <p className="research-report__muted">Helix reviewed this source, but no short excerpt was stored for the report surface.</p> : <p className="research-report__warning-copy">This source was discovered but could not be fully reviewed. Its absence has not been treated as evidence.</p>}<SourceLink source={source} /></div></details>;
          })}</div> : <div className="research-report__empty"><strong>No source records were returned.</strong><span>The report is still available, but the source trail could not be displayed.</span><button type="button" className="btn btn-ghost" onClick={() => void retryGraph()} disabled={graphLoading}>{graphLoading ? "Loading…" : "Load source details"}</button></div>}
        </section>

        <section className="research-report__section" id="evidence-check" aria-labelledby="evidence-check-title"><div className="research-report__section-head"><div><p className="eyebrow">Cross-check</p><h3 id="evidence-check-title">Evidence check</h3></div><span>{conflictCount === 0 ? "No conflicts found" : `${conflictCount} area${conflictCount === 1 ? "" : "s"} to review`}</span></div>{conflictCount === 0 ? <div className="research-report__check-success"><strong>✓ No major conflicts were surfaced between the reviewed sources.</strong><span>Helix did not identify a material contradiction that required adjudication in this run.</span></div> : <div className="research-report__conflicts">{graphConflicts.map((item, index) => <article key={item.id || `graph-conflict-${index}`} className={String(item.status).toLowerCase() === "unresolved" ? "is-unresolved" : ""}><div className="research-report__conflict-head"><span className="research-report__status">{humanize(item.status || "reviewed")}</span><strong>Evidence overlap {item.overlapScore != null ? `${item.overlapScore}%` : "detected"}</strong></div><p>{item.reason || "Helix found evidence that should be considered together rather than averaged into a single certainty."}</p><div className="research-report__conflict-resolution"><strong>Helix's conclusion</strong><span>{item.resolution || "No clear resolution was established from the available evidence."}</span></div></article>)}{disagreements.map((item, index) => <article key={`${item.topic}-${index}`} className={String(item.resolution || "").toLowerCase().includes("unresolved") ? "is-unresolved" : ""}><div className="research-report__conflict-head"><span className="research-report__status">Source disagreement</span><strong>{item.topic || "Conflicting evidence"}</strong></div>{Array.isArray(item.positions) && item.positions.length > 0 ? <div className="research-report__positions">{item.positions.map((position, positionIndex) => <p key={positionIndex}>{position}</p>)}</div> : <p>No separate source positions were returned.</p>}<div className="research-report__conflict-resolution"><strong>Helix's conclusion</strong><span>{item.resolution || "No clear resolution was established."}{item.confidence != null ? ` · ${item.confidence}% confidence` : ""}</span></div></article>)}{unresolvedCount > 0 && <p className="research-report__unresolved-note">{unresolvedCount} conflict{unresolvedCount === 1 ? " remains" : "s remain"} unresolved. That uncertainty is intentionally preserved rather than being averaged away.</p>}</div>}</section>

        <section className="research-report__section" id="assessment" aria-labelledby="assessment-title"><div className="research-report__section-head"><div><p className="eyebrow">Research conclusion</p><h3 id="assessment-title">Final assessment</h3></div>{reliability && <span>{reliability.overall_score}% overall confidence</span>}</div><div className="research-report__assessment"><article><h4>What we can say confidently</h4>{safeClaims.length > 0 ? <ul>{safeClaims.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="research-report__muted">The brief did not return a separate safe-claims list. Use the finding-level evidence links above to judge individual statements.</p>}</article><article><h4>What remains uncertain</h4>{(gaps.length > 0 || reliability?.limitations?.length > 0) ? <ul>{[...(gaps || []), ...(reliability?.limitations || [])].map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="research-report__muted">No explicit knowledge gaps or limitations were returned in the saved brief.</p>}</article><article className="research-report__assessment--bottom-line"><h4>Bottom line</h4><p>{deep.executive_summary || deep.why_it_matters || research?.summary || "The research brief is complete, but no final synthesis text was returned."}</p>{reliability?.rationale && <span>{reliability.rationale}</span>}</article></div></section>

        {(avoidClaims.length > 0 || opportunities.length > 0) && <details className="research-report__guardrails"><summary>Before turning this into a video</summary>{avoidClaims.length > 0 && <div><h4>Claims to avoid</h4><ul>{avoidClaims.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}{opportunities.length > 0 && <div><h4>Story opportunities</h4><ul>{opportunities.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}</details>}

        <section className="research-report__handoff" aria-labelledby="handoff-title"><div><p className="eyebrow">Next step</p><h3 id="handoff-title">Ready to turn this research into a video?</h3><p>Use the evidence-backed story direction from this report to continue into guided setup.</p><div className="research-report__handoff-meta">{deep.recommended_story_angle && <span><strong>Angle</strong>{deep.recommended_story_angle}</span>}{deep.recommended_framework && <span><strong>Format</strong>{deep.recommended_framework}</span>}{deep.recommended_length_seconds && <span><strong>Length</strong>{deep.recommended_length_seconds}s</span>}{deep.recommended_tone && <span><strong>Tone</strong>{deep.recommended_tone}</span>}</div></div><div className="research-report__handoff-actions"><button className="btn btn-ghost" type="button" onClick={() => setAssistantOpen(true)}>Ask Helix</button><button className="btn btn-cream" type="button" onClick={onContinueSetup}>Continue to guided setup →</button></div></section>
      </section>

      {selectedFinding && <div className="research-detail-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedFinding(null); }}><div className="research-detail-drawer" role="dialog" aria-modal="true" aria-label="Finding evidence details"><ResearchFindingInspector finding={selectedFinding} claim={inspectedClaim} evidence={selectedEvidence} sources={selectedSources} onClose={() => setSelectedFinding(null)} /></div></div>}
      {assistantOpen && <div className="research-assistant-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAssistantOpen(false); }}><div className="research-assistant-drawer" role="dialog" aria-modal="true" aria-label="Ask Helix"><button type="button" className="research-assistant-drawer__close btn btn-ghost" onClick={() => setAssistantOpen(false)}>Close</button><ResearchAssistantPanel projectId={projectId} /></div></div>}
    </>
  );
}
