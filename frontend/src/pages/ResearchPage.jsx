import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import ResearchProgress from "../components/ResearchProgress";
import "../components/ui.css";

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

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!project || ["ready", "error"].includes(project.researchStatus)) return undefined;
    const timer = window.setInterval(load, 1800);
    return () => window.clearInterval(timer);
  }, [project, load]);

  const researchError = error || project?.error;
  return (
    <div className="hx-page">
      <Header />
      <main className="container">
        <ResearchProgress
          status={researchError ? "error" : project?.researchStatus || "queued"}
          error={researchError}
          onBack={() => navigate("/")}
          onReady={() => { if (project?.id) navigate(`/storyboard/${project.id}`); }}
        />
      </main>
    </div>
  );
}
