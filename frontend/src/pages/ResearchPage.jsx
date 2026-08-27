import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import ResearchProgress from "../components/ResearchProgress";
import "../components/ui.css";
import "../components/ResearchProgress.css";

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
    } catch (err) { setError(err.message || "Failed to load research."); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!project || ["ready", "error"].includes(project.researchStatus)) return undefined;
    const timer = window.setInterval(load, 1800);
    return () => window.clearInterval(timer);
  }, [project, load]);

  const researchError = error || project?.error;
  const research = project?.research;
  return (
    <div className="hx-page">
      <Header right={<button className="btn btn-ghost" onClick={() => navigate("/")}>Signals</button>} />
      <main className="container">
        <ResearchProgress status={researchError ? "error" : project?.researchStatus || "queued"} error={researchError} onBack={() => navigate("/")} />
        {project?.researchStatus === "ready" && research && (
          <section className="research-brief" aria-labelledby="research-brief-title">
            <p className="eyebrow">Research brief</p>
            <h2 id="research-brief-title">What Helix found</h2>
            <p>{research.summary}</p>
            {research.sources?.length > 0 && <div><h3>Supporting sources</h3><ul>{research.sources.map((source, index) => <li key={`${source.url}-${index}`}><strong>{source.title}</strong><span>{source.note}</span><small>{source.source_reliability}</small></li>)}</ul></div>}
            {research.monetizationFlags?.length > 0 && <div><h3>Monetization notes</h3><ul>{research.monetizationFlags.map((flag, index) => <li key={`${flag.issue}-${index}`}><strong>{flag.severity}</strong> {flag.issue}</li>)}</ul></div>}
          </section>
        )}
      </main>
    </div>
  );
}
