import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import ConfirmDialog from "../components/ConfirmDialog";
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

const STATUS_FILTERS = [
  ["all", "All"],
  ["researching", "Researching"],
  ["setup", "Setup"],
  ["storyboard", "Storyboard"],
  ["finalize", "Ready to export"],
  ["published", "Published"],
];

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
  if (project.status === "storyboard" || project.status === "rendering") return `/storyboard/${project.id}?stage=storyboard`;
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
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [deletingId, setDeletingId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  async function loadProjects() {
    setStatus("loading");
    setError("");
    try {
      const response = await fetch("/api/projects?userId=local-user", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Request failed with ${response.status}`);
      setProjects(data.projects || []);
      setStatus("ready");
    } catch (err) {
      setError(err.message || "Failed to load research history.");
      setStatus("error");
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  const categories = useMemo(() => {
    return ["all", ...Array.from(new Set(projects.map((project) => project.category).filter(Boolean))).sort()];
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects.filter((project) => {
      if (statusFilter !== "all" && project.status !== statusFilter) return false;
      if (categoryFilter !== "all" && project.category !== categoryFilter) return false;
      if (!needle) return true;
      return [project.title, project.category, project.sourceName, project.sourceType]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [projects, query, statusFilter, categoryFilter]);

  const counts = useMemo(() => ({ total: projects.length, ready: projects.filter((p) => p.researchReady).length, published: projects.filter((p) => p.status === "published").length }), [projects]);

  function requestDelete(event, project) {
    event.stopPropagation();
    if (deletingId) return;
    setDeleteTarget(project);
  }

  async function deleteProject() {
    const project = deleteTarget;
    if (!project || deletingId) return;
    setDeleteTarget(null);
    setDeletingId(project.id);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}?userId=local-user`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to delete research project.");
      setProjects((current) => current.filter((item) => item.id !== project.id));
    } catch (err) {
      setError(err.message || "Failed to delete research project.");
    } finally {
      setDeletingId("");
    }
  }

  function clearFilters() {
    setQuery("");
    setStatusFilter("all");
    setCategoryFilter("all");
  }

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
        {status === "error" && <div className="my-research__empty"><strong>Couldn't load My Research.</strong><span>{error}</span><button className="btn btn-cream" onClick={loadProjects}>Retry</button></div>}

        {status === "ready" && projects.length > 0 && (
          <section className="my-research__controls" aria-label="Research filters">
            <div className="my-research__search">
              <label htmlFor="my-research-search">Search</label>
              <input id="my-research-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search research titles, sources…" maxLength={200} />
            </div>
            <div className="my-research__filter-group">
              <span className="my-research__filter-label">Status</span>
              <div className="my-research__pills" role="tablist" aria-label="Filter research by status">
                {STATUS_FILTERS.map(([value, label]) => (
                  <button key={value} type="button" className={`pill ${statusFilter === value ? "is-active" : ""}`} aria-selected={statusFilter === value} onClick={() => setStatusFilter(value)}>{label}</button>
                ))}
              </div>
            </div>
            <div className="my-research__filter-group">
              <label className="my-research__filter-label" htmlFor="my-research-category">Category</label>
              <select id="my-research-category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                {categories.map((category) => <option key={category} value={category}>{category === "all" ? "All categories" : category}</option>)}
              </select>
            </div>
            {(query || statusFilter !== "all" || categoryFilter !== "all") && (
              <button type="button" className="btn btn-ghost my-research__clear" onClick={clearFilters}>Clear filters</button>
            )}
          </section>
        )}

        {error && status === "ready" && <div className="my-research__inline-error"><strong>Couldn't complete that action.</strong><span>{error}</span></div>}
        {status === "ready" && projects.length === 0 && <div className="my-research__empty"><strong>No research yet.</strong><span>Choose a signal from the Signals page and direct your first Reel.</span><Link className="btn btn-cream" to="/">Browse signals <IconArrowRight className="btn-icon" /></Link></div>}
        {status === "ready" && projects.length > 0 && filteredProjects.length === 0 && <div className="my-research__empty"><strong>No matching research.</strong><span>Try a different title, status, or category filter.</span><button className="btn btn-ghost" onClick={clearFilters}>Clear filters</button></div>}

        {status === "ready" && filteredProjects.length > 0 && (
          <section className="my-research__grid" aria-label="Research projects">
            {filteredProjects.map((project) => (
              <article key={project.id} className="my-research-card">
                <button type="button" className="my-research-card__body" onClick={() => navigate(nextRoute(project))} aria-label={`Open ${project.title}`}>
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
                <div className="my-research-card__footer">
                  <span>{project.updatedAt ? `Updated ${formatDate(project.updatedAt)}` : "Saved project"}</span>
                  <button type="button" className="btn btn-danger" onClick={(event) => requestDelete(event, project)} disabled={deletingId === project.id}>
                    {deletingId === project.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this research project?"
        message={deleteTarget ? `“${deleteTarget.title}” will be permanently removed along with its saved research, storyboard, exports, audio, cached B-roll, and rendered video.` : ""}
        confirmLabel="Delete project"
        cancelLabel="Keep project"
        tone="danger"
        onConfirm={deleteProject}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
