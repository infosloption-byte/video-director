import { useEffect, useState } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import PhonePreview from "../components/PhonePreview";
import StepCard from "../components/StepCard";
import PreviewPanel from "../components/PreviewPanel";
import SetupPanel from "../components/SetupPanel";
import { IconArrowLeft, IconInfo, IconArrowRight, IconCheck } from "../components/Icons";
import { storyboards } from "../data/signals";
import "../components/ui.css";
import "../components/SetupPanel.css";
import "./StoryboardPage.css";

const TABS = [
  { n: "00", label: "Research" },
  { n: "01", label: "Setup" },
  { n: "02", label: "Storyboard" },
  { n: "03", label: "Preview" },
];

export default function StoryboardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const legacyBoard = storyboards[id];
  const [project, setProject] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState(searchParams.get("stage") || (legacyBoard ? "Storyboard" : "Setup"));
  const [published, setPublished] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadProject() {
      try {
        const response = await fetch(`/api/projects/${id}/research`);
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setProject(data.project);
      } catch {
        // Legacy mock storyboards do not have a project API record.
      }
    }
    loadProject();
    return () => { cancelled = true; };
  }, [id]);

  const board = legacyBoard;
  const realProject = Boolean(project);

  useEffect(() => {
    if (realProject && project?.setup && tab === "Setup") setTab("Storyboard");
  }, [realProject, project?.setup, tab]);

  if (!board && !realProject) {
    return (
      <div className="hx-page">
        <Header right={<Link to="/" className="btn btn-ghost"><IconArrowLeft className="btn-icon" /> Signals</Link>} />
        <div className="container hx-notfound">
          <p>We couldn't find this reel project.</p>
          <button className="btn btn-cream" onClick={() => navigate("/")}>Back to signals</button>
        </div>
      </div>
    );
  }

  if (realProject) {
    return (
      <div className="hx-page">
        <Header right={<Link to="/" className="btn btn-ghost"><IconArrowLeft className="btn-icon" /> Signals</Link>} />
        <main className="container hx-board">
          <div className="hx-board__head">
            <div>
              <p className="eyebrow">{project.status === "storyboard" ? "Setup locked" : "Research complete"}</p>
              <h1 className="hx-board__title">{project.title}</h1>
            </div>
            <div className="hx-tabs" role="tablist" aria-label="Reel stages">
              {TABS.map((t) => (
                <button key={t.label} role="tab" aria-selected={tab === t.label} className={`hx-tab ${tab === t.label ? "is-active" : ""}`} onClick={() => setTab(t.label)}>
                  <span className="mono-label hx-tab__n">{t.n}</span> {t.label}
                </button>
              ))}
            </div>
          </div>

          {tab === "Research" && (
            <section className="research-brief">
              <p className="eyebrow">Research brief</p>
              <h2>What Helix found</h2>
              <p>{project.research?.summary}</p>
              {project.research?.sources?.length > 0 && <div><h3>Supporting sources</h3><ul>{project.research.sources.map((source, index) => <li key={`${source.url}-${index}`}><strong>{source.title}</strong><span>{source.note}</span><small>{source.source_reliability}</small></li>)}</ul></div>}
              <div className="setup-actions"><button className="btn btn-cream" onClick={() => setTab("Setup")}>Continue to setup <IconArrowRight className="btn-icon" /></button></div>
            </section>
          )}

          {tab === "Setup" && <SetupPanel projectId={id} onComplete={(updated) => { setProject((current) => ({ ...current, ...updated })); setTab("Storyboard"); }} />}

          {tab === "Storyboard" && (
            <section className="research-brief">
              <p className="eyebrow">Storyboard stage</p>
              <h2>Setup is locked. Ready to direct the scenes.</h2>
              <p>Length: {project.setup?.length || "—"}s · Framework: {project.setup?.framework || "—"} · Tone: {project.setup?.tone || "—"} · Audience: {project.setup?.audienceLevel || "—"}</p>
              <div className="setup-actions"><button className="btn btn-cream" onClick={() => setTab("Preview")}>Preview <IconArrowRight className="btn-icon" /></button></div>
            </section>
          )}

          {tab === "Preview" && (
            <section className="research-brief">
              <p className="eyebrow">Finalize</p>
              <h2>Preview arrives with storyboard generation.</h2>
              <p>Your guided setup is saved. Scene generation and the live preview will be connected in the next stage.</p>
              <div className="setup-actions"><button className="btn btn-ghost" onClick={() => setTab("Setup")}>Back to setup</button></div>
            </section>
          )}
        </main>
      </div>
    );
  }

  // Keep the original demo storyboard available while the real M5 scene pipeline is built.
  return (
    <div className="hx-page">
      <Header right={<Link to="/" className="btn btn-ghost"><IconArrowLeft className="btn-icon" /> Signals</Link>} />
      <main className="container hx-board">
        <div className="hx-board__head">
          <div><p className="eyebrow">{board.framework} · {board.frameworkName}</p><h1 className="hx-board__title">{board.title}</h1></div>
          <div className="hx-tabs" role="tablist" aria-label="Storyboard stage">
            <button className={`hx-tab ${tab === "Storyboard" ? "is-active" : ""}`} onClick={() => setTab("Storyboard")}><span className="mono-label hx-tab__n">02</span> Storyboard</button>
            <button className={`hx-tab ${tab === "Preview" ? "is-active" : ""}`} onClick={() => setTab("Preview")}><span className="mono-label hx-tab__n">03</span> Preview</button>
          </div>
        </div>
        <div className="hx-board__layout">
          <PhonePreview step={board.steps[activeStep]} duration={board.duration} cuts={board.cuts} playing={playing} onTogglePlay={() => setPlaying((p) => !p)} />
          <div className="hx-board__content">
            {tab === "Storyboard" && <>
              <div className="hx-hookbox"><IconInfo className="hx-hookbox__icon" /><p><span className="mono-label">HOOK</span> {board.hook}</p></div>
              <div className="hx-steps">{board.steps.map((step, i) => <StepCard key={step.n} step={step} active={activeStep === i} onFocus={() => { setActiveStep(i); setPlaying(false); }} />)}</div>
              <div className="hx-board__actions"><button className="btn btn-ghost" onClick={() => navigate("/")}><IconArrowLeft className="btn-icon" /> Back</button><button className="btn btn-cream" onClick={() => setTab("Preview")}>Preview &amp; publish pack <IconArrowRight className="btn-icon" /></button></div>
            </>}
            {tab === "Preview" && (published ? <div className="hx-published"><span className="hx-published__icon"><IconCheck /></span><h3>Reel pack published</h3><p>"{board.title}" is queued for export at {board.duration}, {board.cuts} cuts.</p><div className="hx-board__actions" style={{ justifyContent: "center", gap: 12 }}><button className="btn btn-ghost" onClick={() => setPublished(false)}><IconArrowLeft className="btn-icon" /> Back to preview</button><button className="btn btn-cream" onClick={() => navigate("/")}>Done</button></div></div> : <div className="hx-published"><h3>Preview &amp; publish pack</h3><p>Legacy demo storyboard preview.</p><button className="btn btn-cream" onClick={() => setPublished(true)}>Publish pack</button></div>)}
          </div>
        </div>
      </main>
    </div>
  );
}
