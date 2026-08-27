import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import ResearchProgress from "../components/ResearchProgress";
import "../components/ui.css";
import "../components/ResearchProgress.css";
import "../components/ResearchBrief.css";

export default function ResearchPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${id}/research`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to load research.");
      setProject(data.project);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load research.");
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const researchStatus = project?.researchStatus;
  const finished = researchStatus === "ready" || researchStatus === "error";
  useEffect(() => {
    if (finished) return undefined;
    const timer = window.setInterval(() => { void load(); }, 1200);
    return () => window.clearInterval(timer);
  }, [finished, load]);

  const researchError = error || project?.error;
  const research = project?.research;

  return (
    <div className="hx-page">
      <Header right={<button className="btn btn-ghost" onClick={() => navigate("/")}>Signals</button>} />
      <main className="container">
        <ResearchProgress
          status={researchError ? "error" : researchStatus || "queued"}
          progress={project?.researchProgress ?? 0}
          stageLabel={project?.researchStageLabel}
          stageDetail={project?.researchStageDetail}
          error={researchError}
          onBack={() => navigate("/")}
        />
        {researchStatus === "ready" && research && (
          <section className="research-brief" aria-labelledby="research-brief-title">
            <p className="eyebrow">Research brief</p>
            <h2 id="research-brief-title">What Helix found</h2>
            <p>{research.summary}</p>
            {research.sources?.length > 0 && (
              <div>
                <h3>Supporting sources</h3>
                <ul>{research.sources.map((source, index) => <li key={`${source.url}-${index}`}><strong>{source.title}</strong><span>{source.note}</span><small>{source.source_reliability}</small></li>)}</ul>
              </div>
            )}
            {research.monetizationFlags?.length > 0 && (
              <div>
                <h3>Monetization notes</h3>
                <ul>{research.monetizationFlags.map((flag, index) => <li key={`${flag.issue}-${index}`}><strong>{flag.severity}</strong> {flag.issue}</li>)}</ul>
              </div>
            )}
            <div className="research-brief__actions">
              <button className="btn btn-cream" onClick={() => navigate(`/storyboard/${id}?stage=setup`)}>Continue to guided setup →</button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
