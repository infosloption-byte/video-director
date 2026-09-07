import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import ResearchProgress from "../components/ResearchProgress";
import ResearchFindingInspector from "../components/ResearchFindingInspector";
import ResearchAssistantPanel from "../components/ResearchAssistantPanel";
import "../components/ui.css";
import "../components/ResearchProgress.css";
import "../components/ResearchBrief.css";
import "../components/ResearchAssistantPanel.css";
import "./ResearchStageUX.css";

function SourceLink({ source }) { if (!source?.url) return null; return <a href={source.url} target="_blank" rel="noreferrer">Open source ↗</a>; }
function VerificationBadge({ claim }) { const status = claim?.verificationStatus || claim?.verification_status || "unverified"; return <span className={`research-brief__verification research-brief__verification--${status}`}>{status.replaceAll("_", " ")}</span>; }
function activityLabel(item) { const labels = { "research.started": "Deep research started", "research.retry_started": "Manual research retry started", "research.plan_created": "Research plan created", "search.started": "Targeted source discovery started", "search.completed": "Source discovery completed", "source.queue_ready": "Priority sources selected", "source.read_started": "Reading source", "source.read_complete": "Source read successfully", "source.read_failed": "Source could not be fully read", "verification.started": "Evidence verification started", "verification.completed": "Source and claim verification completed", "verification.adjudicated": "Evidence conflicts adjudicated", "research.corpus_persisted": "Research corpus persisted", "research.ready": "Research brief ready", "research.failed": "Research failed" }; return labels[item?.type] || "Research activity"; }
function formatActivityDetail(item) { if (item?.type === "source.read_complete") return `${item.title || item.url || "Source"} · ${item.chars || 0} characters read`; if (item?.type === "source.read_failed") return `${item.title || item.url || "Source"} · ${item.status || "unavailable"}`; return item?.message || item?.title || "Helix is processing the research corpus."; }
function normalizeClaimText(value) { return String(value || "").replace(/\s+/g, " ").trim().toLowerCase(); }
function sourceAssessmentMap(items = []) { return new Map(items.map((item) => [Number(item.source_index), item])); }

const RESEARCH_TABS = [
  ["overview", "Overview", "Detailed findings and research synthesis"],
  ["evidence", "Evidence", "Claims, passages and verification"],
  ["sources", "Sources", "Source quality and reading status"],
  ["review", "Review", "Conflicts and research integrity"],
  ["creative", "Creative", "Turn research into a story"],
];

export default function ResearchPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [graph, setGraph] = useState(null);
  const [activity, setActivity] = useState([]);
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const projectRef = useRef(null);

  async function loadGraph() {
    const response = await fetch(`/api/projects/${id}/research/graph`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Failed to load research evidence.");
    setGraph(data.session || null);
  }

  async function retryResearch() {
    if (retrying) return;
    setRetrying(true);
    setError("");
    setActivity([]);
    setGraph(null);
    setSelectedFinding(null);
    setActiveTab("overview");
    try {
      const response = await fetch(`/api/projects/${id}/research/retry`, { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to retry research.");
      projectRef.current = data.project || projectRef.current;
      setProject(data.project || null);
    } catch (err) {
      setError(err.message || "Failed to retry research.");
    } finally {
      setRetrying(false);
    }
  }

  useEffect(() => {
    let stopped = false; let timer = null; let controller = null;
    async function poll() {
      controller?.abort(); controller = new AbortController();
      try {
        const response = await fetch(`/api/projects/${id}/research`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Failed to load research.");
        if (stopped) return;
        const nextProject = data.project; projectRef.current = nextProject; setProject(nextProject); setError("");
        const terminal = nextProject?.researchStatus === "ready" || nextProject?.researchStatus === "error";
        if (terminal) return;
      } catch (err) { if (stopped || err.name === "AbortError") return; if (!projectRef.current) setError(err.message || "Failed to load research."); }
      if (!stopped) timer = window.setTimeout(poll, 1100);
    }
    void poll();
    return () => { stopped = true; controller?.abort(); if (timer) window.clearTimeout(timer); };
  }, [id]);

  useEffect(() => {
    if (project?.researchStatus === "ready" || project?.researchStatus === "error") return undefined;
    let stopped = false; let timer = null; let controller = null;
    async function pollActivity() {
      controller?.abort(); controller = new AbortController();
      try {
        const response = await fetch(`/api/projects/${id}/research/activity`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (stopped) return;
        if (response.ok) setActivity(Array.isArray(data.activities) ? data.activities : []);
        const terminal = data.status === "ready" || data.status === "error";
        if (terminal) return;
      } catch (err) {
        if (stopped || err.name === "AbortError") return;
      }
      if (!stopped) timer = window.setTimeout(pollActivity, 1000);
    }
    void pollActivity();
    return () => { stopped = true; controller?.abort(); if (timer) window.clearTimeout(timer); };
  }, [id, project?.researchStatus]);

  useEffect(() => {
    if (project?.researchStatus !== "ready") return undefined;
    loadGraph().catch(() => {}).finally(() => {});
    return () => {};
  }, [id, project?.researchStatus]);

  const researchStatus = project?.researchStatus;
  const researchError = researchStatus === "error" ? project?.error : error;
  const research = project?.research;
  const deep = research?.sources && typeof research.sources === "object" && !Array.isArray(research.sources) ? research.sources : (research?.deepResearch || {});
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

  const inspectedClaim = selectedFinding ? verifiedClaims.find((claim) => normalizeClaimText(claim.claimText) === normalizeClaimText(selectedFinding.claim)) : null;
  const selectedEvidence = useMemo(() => {
    if (!selectedFinding) return [];
    if (inspectedClaim?.evidenceLinks?.length) return inspectedClaim.evidenceLinks.map((link) => link.evidence).filter(Boolean);
    return (selectedFinding.evidence_indexes || []).map((index) => graphEvidence.find((item) => Number(item.evidenceIndex) === Number(index))).filter(Boolean);
  }, [selectedFinding, inspectedClaim, graphEvidence]);
  const selectedSources = useMemo(() => {
    if (!selectedFinding) return [];
    if (inspectedClaim?.sourceLinks?.length) return inspectedClaim.sourceLinks.map((link) => link.source).filter(Boolean);
    return (selectedFinding.source_indexes || []).map((index) => graphSources.find((source) => Number(source.sourceIndex) === Number(index))).filter(Boolean);
  }, [selectedFinding, inspectedClaim, graphSources]);

  const navigation = <><Link to="/my-research" className="btn btn-ghost">My Research</Link><button className="btn btn-ghost" onClick={() => navigate("/")}>Signals</button></>;

  return (
    <div className="hx-page">
      <Header right={navigation} />
      <main className="container">
        <ResearchProgress status={researchError ? "error" : researchStatus || "queued"} progress={project?.researchProgress ?? 0} stageLabel={project?.researchStageLabel} stageDetail={project?.researchStageDetail} error={researchError} onBack={() => navigate("/")} onRetry={retryResearch} retrying={retrying} />

        {activity.length > 0 && <section className="research-brief__activity research-brief__activity--live" aria-label="Research activity"><div><p className="eyebrow">{researchStatus === "ready" ? "Research activity" : "Live research stream"}</p><h3>{researchStatus === "ready" ? "Research pipeline completed" : "What Helix is doing now"}</h3></div><div role="log" aria-live="polite">{activity.slice(-8).reverse().map((item) => <article key={item.id}><span>{activityLabel(item)}</span><strong>{formatActivityDetail(item)}</strong><small>{new Date(item.at).toLocaleTimeString()}</small></article>)}</div></section>}

        {researchStatus === "ready" && research && <>
          <div className="research-assistant-toolbar"><div><p className="eyebrow">Research workspace</p><span>Explore the brief or ask Helix about it.</span></div><button type="button" className="btn btn-ghost" onClick={() => setAssistantOpen((open) => !open)} aria-expanded={assistantOpen} aria-controls="research-assistant-panel">{assistantOpen ? "Hide Ask Helix" : "Ask Helix"}</button></div>
          <div className={assistantOpen ? "research-workspace-layout" : "research-workspace-layout research-workspace-layout--assistant-closed"}>
            <section className="research-brief research-brief--deep" aria-labelledby="research-brief-title">
              <div className="research-brief__hero research-brief__hero--compact"><div><p className="eyebrow">Research intelligence brief</p><h2 id="research-brief-title">What Helix found</h2><p className="research-brief__summary">{deep.executive_summary || research.summary}</p></div>{reliability && <div className="research-brief__confidence"><strong>{reliability.overall_score}%</strong><span>{reliability.label} confidence</span></div>}</div>
              {deep.research_metrics && <div className="research-brief__metrics">{[["Sources discovered", deep.research_metrics.discovered_sources], ["Sources read", deep.research_metrics.sources_read], ["Evidence passages", deep.research_metrics.evidence_passages], ["Not fully read", deep.research_metrics.sources_unread], ["Claims checked", deep.research_metrics.claims_checked], ["Claims traceable", deep.research_metrics.claims_traceable]].map(([label, value]) => <div key={label}><strong>{value ?? 0}</strong><span>{label}</span></div>)}</div>}
              <nav className="research-brief__tabs" aria-label="Research brief sections">{RESEARCH_TABS.map(([key, label, detail]) => <button type="button" key={key} className={activeTab === key ? "is-active" : ""} onClick={() => setActiveTab(key)} aria-current={activeTab === key ? "page" : undefined}><strong>{label}</strong><span>{detail}</span></button>)}</nav>
              <div className="research-brief__tab-content">
                {activeTab === "overview" && <section aria-labelledby="findings-title">{[["Executive synthesis", deep.executive_summary], ["What happened", deep.what_happened], ["Why it matters", deep.why_it_matters], ["How it works", deep.mechanism]].filter(([, text]) => text).map(([title, text]) => <article key={title} className="research-brief__panel research-brief__synthesis-panel"><p className="eyebrow">{title}</p><p>{text}</p></article>)}<div className="research-brief__section-head"><div><p className="eyebrow">Interactive evidence view</p><h3 id="findings-title">Key findings</h3></div><span>{findings.length} findings</span></div>{findings.length > 0 ? <div className="research-brief__finding-list research-brief__finding-list--grid">{findings.map((item, index) => { const claim = verifiedClaims.find((candidate) => normalizeClaimText(candidate.claimText) === normalizeClaimText(item.claim)); const verified = Number(claim?.verifiedConfidence ?? item.confidence ?? 0); const evidenceCount = claim?.evidenceLinks?.length ?? item.evidence_indexes?.length ?? 0; return <button type="button" key={`${item.claim}-${index}`} className={`research-brief__finding-card${selectedFinding === item ? " research-brief__finding-card--selected" : ""}`} onClick={() => { setSelectedFinding(item); setActiveTab("evidence"); }} aria-pressed={selectedFinding === item}><div className="research-brief__finding-card-head"><span className={`research-brief__level research-brief__level--${item.evidence_level}`}>{item.evidence_level}</span><span className="research-brief__finding-action">Inspect →</span></div><strong>{item.claim}</strong><p>{item.evidence}</p><div className="research-brief__finding-confidence"><div><span>Confidence</span><strong>{verified}%</strong></div><div><span>Evidence</span><strong>{evidenceCount}</strong></div></div><div className="research-brief__confidence-bar" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, verified))}%` }} /></div></button>; })}</div> : <p className="research-brief__empty">No key findings were returned in the saved research brief.</p>}{numbers.length > 0 && <div className="research-brief__subsection"><div className="research-brief__section-head"><div><p className="eyebrow">Data</p><h3>Important numbers</h3></div><span>{numbers.length} data points</span></div><div className="research-brief__data-grid">{numbers.map((item, index) => <article key={`${item.value}-${index}`}><strong>{item.value}</strong><span>{item.context}</span></article>)}</div></div>}</section>}
                {activeTab === "evidence" && <section aria-labelledby="evidence-title"><div className="research-brief__section-head"><div><p className="eyebrow">Traceability</p><h3 id="evidence-title">Claims & exact evidence</h3></div><span>{verifiedClaims.length} claims</span></div>{selectedFinding && <ResearchFindingInspector finding={selectedFinding} claim={inspectedClaim} evidence={selectedEvidence} sources={selectedSources} onClose={() => setSelectedFinding(null)} />}{!selectedFinding && verifiedClaims.length > 0 && <div className="research-brief__empty-state"><strong>Select a finding from Overview</strong><span>Helix will show the exact supporting passages, confidence and source comparison here.</span></div>}{!selectedFinding && verifiedClaims.length === 0 && <div className="research-brief__empty-state"><strong>No persisted claim graph was returned.</strong><span>The completed synthesis is still available in Overview; refresh the research graph if this persists.</span></div>}{numbers.length > 0 && <div className="research-brief__subsection"><div className="research-brief__section-head"><div><p className="eyebrow">Data</p><h3>Important numbers</h3></div></div><div className="research-brief__data-grid">{numbers.map((item, index) => <article key={`${item.value}-${index}`}><strong>{item.value}</strong><span>{item.context}</span></article>)}</div></div>}{verifiedClaims.length > 0 && <div className="research-brief__subsection"><div className="research-brief__finding-list research-brief__finding-list--grid">{verifiedClaims.map((claim) => <article key={claim.id}><div><VerificationBadge claim={claim} /><strong>{claim.claimText}</strong></div><small>{claim.verifiedConfidence ?? 0}% verified · {claim.verification?.authorityScore ?? 0}% authority · {claim.verification?.corroborationScore ?? 0}% corroboration</small></article>)}</div></div>}</section>}
                {activeTab === "sources" && <section aria-labelledby="sources-title"><div className="research-brief__section-head"><div><p className="eyebrow">Source inspection</p><h3 id="sources-title">Research source library</h3></div><span>{graphSources.length || research.sources?.sources?.length || 0} sources</span></div>{(graphSources.length > 0 || research.sources?.sources?.length > 0) ? <div className="research-source-table-wrap"><table className="research-source-table"><thead><tr><th>Source</th><th>Type</th><th>Read status</th><th>Authority</th><th>Relevance</th><th>Evidence quality</th><th>Link</th></tr></thead><tbody>{(graphSources.length > 0 ? graphSources : (research.sources.sources || []).map((source, index) => ({ id: `${source.url}-${index}`, sourceIndex: source.index ?? index, title: source.title, sourceClass: source.source_class, readStatus: source.read_status, authorityScore: source.quality_prior, url: source.url }))).map((source) => { const assessment = sourceAssessments.get(Number(source.sourceIndex)); const authority = assessment?.authority ?? source.authorityScore ?? source.quality_prior; return <tr key={source.id || `${source.url}-${source.sourceIndex}`}><td><strong>{source.title || source.publisher || "Source"}</strong></td><td>{source.sourceClass || source.source_class || source.reliability || "web"}</td><td><span className={`research-source-status research-source-status--${source.readStatus || source.read_status || "unknown"}`}>{source.readStatus || source.read_status || "unknown"}</span></td><td>{authority != null ? `${authority}%` : "—"}</td><td>{assessment?.relevance != null ? `${assessment.relevance}%` : "—"}</td><td>{assessment?.evidence_quality != null ? `${assessment.evidence_quality}%` : "—"}</td><td><SourceLink source={source} /></td></tr>; })}</tbody></table></div> : <p className="research-brief__empty">No source records were returned for this research run.</p>}</section>}
                {activeTab === "review" && <section aria-labelledby="review-title"><div className="research-brief__section-head"><div><p className="eyebrow">Cross-checking</p><h3 id="review-title">Review research integrity</h3></div><span>{graphConflicts.length} conflict cases</span></div>{graphConflicts.length > 0 && <div className="research-brief__conflict-list">{graphConflicts.map((item) => <article key={item.id}><div><span className="research-brief__verification">{item.status}</span><strong>{item.overlapScore}% claim overlap</strong></div><p>{item.reason}</p><small>{item.resolution || "Resolution is available in the research graph."}</small></article>)}</div>}{disagreements.length > 0 && <div className="research-brief__subsection"><div className="research-brief__section-head"><div><p className="eyebrow">Conflicting evidence</p><h3>Where sources disagree</h3></div></div><div className="research-brief__conflict-list">{disagreements.map((item, index) => <article key={`${item.topic}-${index}`}><strong>{item.topic}</strong><p>{item.positions?.join(" / ")}</p><small>{item.resolution} · {item.confidence}% confidence</small></article>)}</div></div>}{reliability && <div className="research-brief__panel research-brief__panel--reliability"><p className="eyebrow">Reliability assessment</p><h3>How much to trust this brief</h3><p>{reliability.rationale}</p>{reliability.limitations?.length > 0 && <ul>{reliability.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul>}</div>}{graphConflicts.length === 0 && disagreements.length === 0 && <div className="research-brief__empty-state"><strong>No contradiction cases were detected.</strong><span>That means the review pass did not surface a conflict requiring manual adjudication.</span></div>}</section>}
                {activeTab === "creative" && <section aria-labelledby="creative-title"><div className="research-brief__section-head"><div><p className="eyebrow">Downstream video guidance</p><h3 id="creative-title">Turn research into a story</h3></div></div><div className="research-brief__creative-summary">{deep.recommended_story_angle && <article className="research-brief__panel"><p className="eyebrow">Recommended angle</p><h3>{deep.recommended_story_angle}</h3><p>{deep.recommended_framework ? `${deep.recommended_framework} framework · ${deep.recommended_length_seconds || "—"}s · ${deep.recommended_tone || "Flexible tone"}.` : "Use the evidence below to shape the narrative."}</p></article>}{safeClaims.length > 0 && <article className="research-brief__panel research-brief__panel--safe"><p className="eyebrow">Use confidently</p><h3>Claims safe to say</h3><ul>{safeClaims.map((item, index) => <li key={index}>{item}</li>)}</ul></article>}{avoidClaims.length > 0 && <article className="research-brief__panel research-brief__panel--avoid"><p className="eyebrow">Avoid overclaiming</p><h3>Claims to avoid</h3><ul>{avoidClaims.map((item, index) => <li key={index}>{item}</li>)}</ul></article>}</div>{gaps.length > 0 && <div className="research-brief__subsection"><div className="research-brief__section-head"><div><p className="eyebrow">Still uncertain</p><h3>Knowledge gaps</h3></div><span>{gaps.length} gaps</span></div><div className="research-brief__compact-list">{gaps.map((item, index) => <div key={index}>{item}</div>)}</div></div>}{opportunities.length > 0 && <div className="research-brief__panel research-brief__creative-angle"><p className="eyebrow">Creative opportunities</p><h3>Video opportunities from the research</h3><ul>{opportunities.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}{!safeClaims.length && !avoidClaims.length && !gaps.length && !opportunities.length && !deep.recommended_story_angle && <div className="research-brief__empty-state"><strong>No downstream story guidance was produced.</strong><span>Regenerate the brief after confirming that the research model returned the creative guidance fields.</span></div>}</section>}
              </div>
              <div className="research-brief__actions"><button className="btn btn-cream" onClick={() => navigate(`/storyboard/${id}?stage=setup`)}>Continue to guided setup →</button></div>
            </section>
            {assistantOpen && <ResearchAssistantPanel projectId={id} />}
          </div>
        </>}
      </main>
    </div>
  );
}
