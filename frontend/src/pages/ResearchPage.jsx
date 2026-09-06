import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import ResearchProgress from "../components/ResearchProgress";
import "../components/ui.css";
import "../components/ResearchProgress.css";
import "../components/ResearchBrief.css";
import "./ResearchStageUX.css";

function SourceLink({ source }) {
  if (!source?.url) return null;
  return <a href={source.url} target="_blank" rel="noreferrer">Open source ↗</a>;
}

export default function ResearchPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [error, setError] = useState("");
  const projectRef = useRef(null);

  useEffect(() => {
    let stopped = false;
    let timer = null;
    let controller = null;
    async function poll() {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch(`/api/projects/${id}/research`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Failed to load research.");
        if (stopped) return;
        const nextProject = data.project;
        projectRef.current = nextProject;
        setProject(nextProject);
        setError("");
        const terminal = nextProject?.researchStatus === "ready" || nextProject?.researchStatus === "error";
        if (terminal) return;
      } catch (err) {
        if (stopped || err.name === "AbortError") return;
        if (!projectRef.current) setError(err.message || "Failed to load research.");
      }
      if (!stopped) timer = window.setTimeout(poll, 1100);
    }
    void poll();
    return () => { stopped = true; controller?.abort(); if (timer) window.clearTimeout(timer); };
  }, [id]);

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

  const navigation = (
    <>
      <Link to="/my-research" className="btn btn-ghost">My Research</Link>
      <button className="btn btn-ghost" onClick={() => navigate("/")}>Signals</button>
    </>
  );

  return (
    <div className="hx-page">
      <Header right={navigation} />
      <main className="container">
        <ResearchProgress status={researchError ? "error" : researchStatus || "queued"} progress={project?.researchProgress ?? 0} stageLabel={project?.researchStageLabel} stageDetail={project?.researchStageDetail} error={researchError} onBack={() => navigate("/")} />
        {researchStatus === "ready" && research && (
          <section className="research-brief research-brief--deep" aria-labelledby="research-brief-title">
            <div className="research-brief__hero">
              <div><p className="eyebrow">Research intelligence brief</p><h2 id="research-brief-title">What Helix found</h2></div>
              {reliability && <div className="research-brief__confidence"><strong>{reliability.overall_score}%</strong><span>{reliability.label} confidence</span></div>}
            </div>

            <p className="research-brief__summary">{deep.executive_summary || research.summary}</p>

            {deep.research_metrics && <div className="research-brief__metrics">{[["Sources discovered", deep.research_metrics.discovered_sources], ["Sources read", deep.research_metrics.sources_read], ["Evidence passages", deep.research_metrics.evidence_passages], ["Sources not fully read", deep.research_metrics.sources_unread]].map(([label, value]) => <div key={label}><strong>{value ?? 0}</strong><span>{label}</span></div>)}</div>}

            <div className="research-brief__grid">
              {[["What happened", deep.what_happened], ["Why it matters", deep.why_it_matters], ["How it works", deep.mechanism]].map(([title, text]) => text && <article key={title} className="research-brief__panel"><h3>{title}</h3><p>{text}</p></article>)}
            </div>

            {findings.length > 0 && <div><h3>Key findings & evidence confidence</h3><div className="research-brief__finding-list">{findings.map((item, index) => <article key={`${item.claim}-${index}`}><div><span className={`research-brief__level research-brief__level--${item.evidence_level}`}>{item.evidence_level}</span><strong>{item.claim}</strong></div><p>{item.evidence}</p><small>{item.confidence}% confidence · source {item.source_indexes?.map((value) => value + 1).join(", ") || "—"}</small></article>)}</div></div>}

            {numbers.length > 0 && <div><h3>Important numbers & data</h3><div className="research-brief__data-grid">{numbers.map((item, index) => <article key={`${item.value}-${index}`}><strong>{item.value}</strong><span>{item.context}</span></article>)}</div></div>}

            {disagreements.length > 0 && <div><h3>Conflicting evidence</h3><ul>{disagreements.map((item, index) => <li key={`${item.topic}-${index}`}><strong>{item.topic}</strong><span>{item.positions?.join(" / ")}</span><span>{item.resolution}</span><small>{item.confidence}% confidence</small></li>)}</ul></div>}

            {reliability && <div className="research-brief__panel research-brief__panel--reliability"><h3>Reliability assessment</h3><p>{reliability.rationale}</p>{reliability.limitations?.length > 0 && <ul>{reliability.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul>}</div>}

            <div className="research-brief__grid">
              {safeClaims.length > 0 && <article className="research-brief__panel"><h3>Claims safe to say</h3><ul>{safeClaims.map((item, index) => <li key={index}>{item}</li>)}</ul></article>}
              {avoidClaims.length > 0 && <article className="research-brief__panel"><h3>Claims to avoid</h3><ul>{avoidClaims.map((item, index) => <li key={index}>{item}</li>)}</ul></article>}
            </div>

            {gaps.length > 0 && <div><h3>Knowledge gaps</h3><ul>{gaps.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
            {opportunities.length > 0 && <div><h3>Creative opportunities</h3><ul>{opportunities.map((item, index) => <li key={index}>{item}</li>)}</ul><p className="research-brief__angle"><strong>Recommended angle:</strong> {deep.recommended_story_angle}</p></div>}

            {research.sources?.length > 0 && <div><h3>Source library</h3><ul>{research.sources.map((source, index) => <li key={`${source.url}-${index}`}><strong>{source.title}</strong><span>{source.note}</span><small>{source.source_class || source.source_reliability} · quality prior {source.quality_prior ?? "—"}</small><SourceLink source={source} /></li>)}</ul></div>}
            <div className="research-brief__actions"><button className="btn btn-cream" onClick={() => navigate(`/storyboard/${id}?stage=setup`)}>Continue to guided setup →</button></div>
          </section>
        )}
      </main>
    </div>
  );
}
