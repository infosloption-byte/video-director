import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { IconArrowLeft, IconArrowRight } from "../components/Icons";
import "../components/ui.css";
import "./MyResearchPage.css";

const STATUS = {
  researching: "Researching",
  setup: "Setup ready",
  storyboard: "Storyboard ready",
  rendering: "Rendering",
  finalize: "Ready to export",
  published: "Published",
};

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "";
  }
}

function formatDuration(value) {
  const seconds = Number(value || 0);
  return seconds > 0 ? `${seconds.toFixed(1)}s` : "—";
}

function nextRoute(project) {
  if (project.status === "researching") return `/research/${project.id}`;
  if (project.status === "setup") return `/storyboard/${project.id}?stage=setup`;
  if (project.status === "storyboard") return `/storyboard/${project.id}?stage=storyboard`;
  return `/storyboard/${project.id}?stage=preview`;
}

function Progress({ project }) {
  const steps = [
    ["Research", project.researchReady],
    ["Setup", project.setupReady],
    ["Storyboard", project.storyboardReady],
    ["Preview", Boolean(project.renderUrl) || ["finalize", "published"].includes(project.status)],
  ];
  return (
    <div className="my-research-card__steps" aria-label="Project progress">
      {steps.map(([label, done], index) => (
        <span key={label} className={done ? "is-done" : ""}>
          <i>{done ? "✓" : String(index + 1).padStart(2, "0")}</i>{label}
        </span>
      ))}
    </div>
  );
}

export default function MyResearchPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatus("loading");
      setError("");
      try {
        const response = await fetch("/api/projects?userId=local-user", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Request failed with ${response.status}`);
        if (cancelled) return;
        setProjects(data.projects || []);
        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load research history.");
          setStatus("error");
        }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => ({ total: projects.length, ready: projects.filter((p) => p.researchReady).length, published: projects.filter((p) => p.status === "published").length }), [projects]);

  return (
    <div className="hx-page">
      <Header right={<Link to="/" className="btn btn-ghost"><IconArrowLeft className="btn-icon" /> Signals</Link>} />
      <main className="container my-research">
        <section className="my-research__intro">
          <div>
            <p className="eyebrow">My research</p>
            <h1>Every signal you turned into a Reel.</h1>
            <p>Open any project to continue the same research → setup → storyboard → preview flow, with everything already saved.</p>
          </div>
          <div className="my-research__stats">
            <span><strong>{counts.total}</strong>Projects</span>
            <span><strong>{counts.ready}</strong>Researched</span>
            <span><strong>{counts.published}</strong>Published</span>
          </div>
        </section>

        {status === "loading" && <div className="my-research__empty">Loading your research…</div>}
        {status === "error" && <div className="my-research__empty"><strong>Couldn't load My Research.</strong><span>{error}</span><button className="btn btn-cream" onClick={() => window.location.reload()}>Retry</button></div>}
        {status === "ready" && projects.length === 0 && <div className="my-research__empty"><strong>No research yet.</strong><span>Choose a signal from the Signals page and direct your first Reel.</span><Link className="btn btn-cream" to="/">Browse signals <IconArrowRight className="btn-icon" /></Link></div>}

        {status === "ready" && projects.length > 0 && (
          <section className="my-research__grid" aria-label="Research projects">
            {projects.map((project) => (
              <button key={project.id} className="my-research-card" onClick={() => navigate(nextRoute(project))}>
                <div className="my-research-card__top">
                  <span className="mono-label">{project.category}</span>
                  <span className={`my-research-card__status status-${project.status}`}>{STATUS[project.status] || project.status}</span>
                </div>
                <h2>{project.title}</h2>
                <p className="my-research-card__source">{project.sourceName || "Research project"} · {formatDate(project.createdAt)}</p>
                <Progress project={project} />
                <div className="my-research-card__meta">
                  <span>{project.cuts || 0} cuts</span>
                  <span>{formatDuration(project.durationSeconds)}</span>
                  <span>{project.researchReady ? "Research saved" : "Research in progress"}</span>
                </div>
                <span className="my-research-card__open">Open project <IconArrowRight className="btn-icon" /></span>
              </button>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
