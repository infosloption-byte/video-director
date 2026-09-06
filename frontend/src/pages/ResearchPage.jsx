import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import ResearchProgress from "../components/ResearchProgress";
import ResearchFindingInspector from "../components/ResearchFindingInspector";
import ResearchWorkspacePanels from "../components/ResearchWorkspacePanels";
import "../components/ui.css";
import "../components/ResearchProgress.css";
import "../components/ResearchBrief.css";
import "./ResearchStageUX.css";

function SourceLink({ source }) { if (!source?.url) return null; return <a href={source.url} target="_blank" rel="noreferrer">Open source ↗</a>; }
function VerificationBadge({ claim }) { const status = claim?.verificationStatus || claim?.verification_status || "unverified"; return <span className={`research-brief__verification research-brief__verification--${status}`}>{status.replaceAll("_", " ")}</span>; }
function activityLabel(item) { const labels = { "research.started": "Deep research started", "research.plan_created": "Research plan created", "search.started": "Targeted source discovery started", "search.completed": "Source discovery completed", "source.queue_ready": "Priority sources selected", "source.read_started": "Reading source", "source.read_complete": "Source read successfully", "source.read_failed": "Source could not be fully read", "verification.started": "Evidence verification started", "verification.completed": "Source and claim verification completed", "verification.adjudicated": "Evidence conflicts adjudicated", "research.corpus_persisted": "Research corpus persisted", "research.ready": "Research brief ready", "research.failed": "Research failed" }; return labels[item?.type] || "Research activity"; }
function formatActivityDetail(item) { if (item?.type === "source.read_complete") return `${item.title || item.url || "Source"} · ${item.chars || 0} characters read`; if (item?.type === "source.read_failed") return `${item.title || item.url || "Source"} · ${item.status || "unavailable"}`; return item?.message || item?.title || "Helix is processing the research corpus."; }
function normalizeClaimText(value) { return String(value || "").replace(/\s+/g, " ").trim().toLowerCase(); }

export default function ResearchPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [graph, setGraph] = useState(null);
  const [activity, setActivity] = useState([]);
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [error, setError] = useState("");
  const projectRef = useRef(null);

  async function loadGraph() {
    const response = await fetch(`/api/projects/${id}/research/graph`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Failed to load research evidence.");
    setGraph(data.session || null);
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
    let stopped = false; let timer = null;
    async function pollActivity() {
      try {
        const response = await fetch(`/api/projects/${id}/research/activity`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (response.ok && !stopped) setActivity(Array.isArray(data.activities) ? data.activities : []);
      } catch { /* Research status polling remains the primary failure signal. */ }
      if (!stopped) timer = window.setTimeout(pollActivity, 1000);
    }
    void pollActivity();
    return () => { stopped = true; if (timer) window.clearTimeout(timer); };
  }, [id]);

  useEffect(() => {
    if (project?.researchStatus !== "ready") return undefined;
    let stopped = false;
    loadGraph().catch(() => {}).finally(() => {});
    return () => { stopped = true; if (stopped) setSelectedFinding(null); };
  }, [id, project?.researchStatus]);

  const researchStatus = project?.researchStatus;
  const researchError = researchStatus === "error" ? project?.error : error;
  const research = project?.research;
  const deep = research?.deepResearch || {};
  const findings = deep.key_findings || [];
  const numbers = deep.important_numbers || [];
  const disagreements = deep.disagreements || [];
  const gaps = deep.knowledge_gaps || [];
  const safeClaims = deep.safe_claims || [];
  const avoidClaims = deep.claims_to_avoid || [];
  const opportunities = deep.creative_opportunities || [];
  const reliability = deep.reliability_assessment;
  const verifiedClaims = graph?.claims || [];
  const graphSources = graph?.sources || [];
  const graphEvidence = graph?.evidence || [];
  const graphConflicts = graph?.conflicts || [];

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
        <ResearchProgress status={researchError ? "error" : researchStatus || "queued"} progress={project?.researchProgress ?? 0} stageLabel={project?.researchStageLabel} stageDetail={project?.researchStageDetail} error={researchError} onBack={() => navigate("/")} />
        {activity.length > 0 && researchStatus !== "ready" && <section className="research-brief__activity" aria-label="Live research activity"><div><p className="eyebrow">Live research stream</p><h3>What Helix is doing now</h3></div><div role="log" aria-live="polite">{activity.slice(-12).reverse().map((item) => <article key={item.id}><span>{activityLabel(item)}</span><strong>{formatActivityDetail(item)}</strong><small>{new Date(item.at).toLocaleTimeString()}</small></article>)}</div></section>}
        {researchStatus === "ready" && activity.length > 0 && <section className="research-brief__activity" aria-label="Research activity history"><div><p className="eyebrow">Research activity</p><h3>Evidence pipeline history</h3></div><div role="log">{activity.slice(-12).reverse().map((item) => <article key={item.id}><span>{activityLabel(item)}</span><strong>{formatActivityDetail(item)}</strong><small>{new Date(item.at).toLocaleTimeString()}</small></article>)}</div></section>}
        {researchStatus === "ready" && research && <section className="research-brief research-brief--deep" aria-labelledby="research-brief-title">
          <div className="research-brief__hero"><div><p className="eyebrow">Research intelligence brief</p><h2 id="research-brief-title">What Helix found</h2></div>{reliability && <div className="research-brief__confidence"><strong>{reliability.overall_score}%</strong><span>{reliability.label} confidence</span></div>}</div>
          <p className="research-brief__summary">{deep.executive_summary || research.summary}</p>
          {deep.research_metrics && <div className="research-brief__metrics">{[["Sources discovered", deep.research_metrics.discovered_sources], ["Sources read", deep.research_metrics.sources_read], ["Evidence passages", deep.research_metrics.evidence_passages], ["Sources not fully read", deep.research_metrics.sources_unread], ["Claims checked", deep.research_metrics.claims_checked], ["Claims traceable", deep.research_metrics.claims_traceable]].map(([label, value]) => <div key={label}><strong>{value ?? 0}</strong><span>{label}</span></div>)}</div>}
          <div className="research-brief__grid">{[["What happened", deep.what_happened], ["Why it matters", deep.why_it_matters], ["How it works", deep.mechanism]].map(([title, text]) => text && <article key={title} className="research-brief__panel"><h3>{title}</h3><p>{text}</p></article>)}</div>
          {findings.length > 0 && <div><div className="research-brief__section-head"><div><p className="eyebrow">Interactive evidence view</p><h3>Key findings & confidence</h3></div><span>{findings.length} findings</span></div><div className="research-brief__finding-list">{findings.map((item, index) => { const claim = verifiedClaims.find((candidate) => normalizeClaimText(candidate.claimText) === normalizeClaimText(item.claim)); const verified = Number(claim?.verifiedConfidence ?? item.confidence ?? 0); const evidenceCount = claim?.evidenceLinks?.length ?? item.evidence_indexes?.length ?? 0; return <button type="button" key={`${item.claim}-${index}`} className={`research-brief__finding-card${selectedFinding === item ? " research-brief__finding-card--selected" : ""}`} onClick={() => setSelectedFinding(item)} aria-pressed={selectedFinding === item}><div className="research-brief__finding-card-head"><span className={`research-brief__level research-brief__level--${item.evidence_level}`}>{item.evidence_level}</span><span className="research-brief__finding-action">Inspect evidence →</span></div><strong>{item.claim}</strong><p>{item.evidence}</p><div className="research-brief__finding-confidence"><div><span>Confidence</span><strong>{verified}%</strong></div><div><span>Evidence</span><strong>{evidenceCount}</strong></div></div><div className="research-brief__confidence-bar" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, verified))}%` }} /></div></button>; })}</div></div>}
          {selectedFinding && <ResearchFindingInspector finding={selectedFinding} claim={inspectedClaim} evidence={selectedEvidence} sources={selectedSources} onClose={() => setSelectedFinding(null)} />}
          {numbers.length > 0 && <div><h3>Important numbers & data</h3><div className="research-brief__data-grid">{numbers.map((item, index) => <article key={`${item.value}-${index}`}><strong>{item.value}</strong><span>{item.context}</span></article>)}</div></div>}
          {graphConflicts.length > 0 && <div><h3>Detected evidence conflicts</h3><ul>{graphConflicts.map((item) => <li key={item.id}><strong>{item.overlapScore}% claim overlap</strong><span>{item.reason}</span><small>{item.status}</small></li>)}</ul></div>}
          {disagreements.length > 0 && <div><h3>Conflicting evidence</h3><ul>{disagreements.map((item, index) => <li key={`${item.topic}-${index}`}><strong>{item.topic}</strong><span>{item.positions?.join(" / ")}</span><span>{item.resolution}</span><small>{item.confidence}% confidence</small></li>)}</ul></div>}
          {verifiedClaims.length > 0 && <div><h3>Verified claims & provenance</h3><div className="research-brief__finding-list">{verifiedClaims.map((claim) => <article key={claim.id}><div><VerificationBadge claim={claim} /><strong>{claim.claimText}</strong></div><small>{claim.verifiedConfidence ?? 0}% verified confidence · {claim.verification?.authorityScore ?? 0}% authority · {claim.verification?.corroborationScore ?? 0}% corroboration</small><div className="research-brief__provenance">{claim.evidenceLinks?.map((link) => <blockquote key={link.evidenceId}>{link.evidence?.passageText}</blockquote>)}{claim.sourceLinks?.map((link) => <span key={link.sourceId}><SourceLink source={link.source} /></span>)}</div></article>)}</div></div>}
          {reliability && <div className="research-brief__panel research-brief__panel--reliability"><h3>Reliability assessment</h3><p>{reliability.rationale}</p>{reliability.limitations?.length > 0 && <ul>{reliability.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul>}</div>}
          {graphSources.length > 0 && <div><h3>Evidence source quality</h3><div className="research-brief__data-grid">{graphSources.slice(0, 12).map((source) => <article key={source.id}><strong>{source.authorityScore ?? 0}% authority</strong><span>{source.sourceClass || source.reliability || "Source"} · {source.readStatus}</span><SourceLink source={source} /></article>)}</div></div>}
          <ResearchWorkspacePanels projectId={id} conflicts={graphConflicts} onRefresh={() => loadGraph().catch(() => {})} />
          <div className="research-brief__grid">{safeClaims.length > 0 && <article className="research-brief__panel"><h3>Claims safe to say</h3><ul>{safeClaims.map((item, index) => <li key={index}>{item}</li>)}</ul></article>}{avoidClaims.length > 0 && <article className="research-brief__panel"><h3>Claims to avoid</h3><ul>{avoidClaims.map((item, index) => <li key={index}>{item}</li>)}</ul></article>}</div>
          {gaps.length > 0 && <div><h3>Knowledge gaps</h3><ul>{gaps.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
          {opportunities.length > 0 && <div><h3>Creative opportunities</h3><ul>{opportunities.map((item, index) => <li key={index}>{item}</li>)}</ul><p className="research-brief__angle"><strong>Recommended angle:</strong> {deep.recommended_story_angle}</p></div>}
          {research.sources?.length > 0 && <div><h3>Source library</h3><ul>{research.sources.map((source, index) => <li key={`${source.url}-${index}`}><strong>{source.title}</strong><span>{source.note}</span><small>{source.source_class || source.source_reliability} · quality prior {source.quality_prior ?? "—"}</small><SourceLink source={source} /></li>)}</ul></div>}
          <div className="research-brief__actions"><button className="btn btn-cream" onClick={() => navigate(`/storyboard/${id}?stage=setup`)}>Continue to guided setup →</button></div>
        </section>}
      </main>
    </div>
  );
}
