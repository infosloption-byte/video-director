import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
    return () => {
      stopped = true;
      controller?.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [id]);

  const researchStatus = project?.researchStatus;
  const researchError = researchStatus === "error" ? project?.error : error;
  const research = project?.research;

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
