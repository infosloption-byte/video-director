import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import PhonePreview from "../components/PhonePreview";
import StepCard from "../components/StepCard";
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

function normalizeStage(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  return TABS.find((tab) => tab.label.toLowerCase() === normalized)?.label || null;
}

function formatDuration(value) {
  const seconds = Number(value || 0);
  return `${seconds.toFixed(1)}s`;
}

function sceneToStep(scene, selectedAssetIndex = 0) {
  const selectedAsset = scene.assets?.[selectedAssetIndex] || scene.assets?.[0];
  return {
    id: scene.id,
    n: String(scene.sceneOrder).padStart(2, "0"),
    title: scene.title,
    line: scene.spokenText,
    time: formatDuration(scene.durationSeconds),
    whyLine: scene.whyLine || "Helix uses the strongest evidence-led line for this beat.",
    whyPicture: scene.whyPicture || "The visual makes the mechanism concrete before the next cut.",
    thumb: selectedAsset ? `url(${selectedAsset.thumbnailUrl}) center / cover no-repeat` : "linear-gradient(145deg, #17304a, #09131f)",
    thumbLabel: selectedAsset ? "Pexels B-roll" : "Visual pending",
    swatches: (scene.assets || []).map((asset) => `url(${asset.thumbnailUrl}) center / cover no-repeat`),
    selectedAsset,
  };
}

export default function StoryboardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const legacyBoard = storyboards[id];
  const [project, setProject] = useState(null);
  const [scenes, setScenes] = useState([]);
  const [activeStep, setActiveStep] = useState(0);
  const [selectedAssetByScene, setSelectedAssetByScene] = useState({});
  const [playing, setPlaying] = useState(false);
  const [published, setPublished] = useState(false);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [sceneError, setSceneError] = useState("");
  const [sceneRetry, setSceneRetry] = useState(0);
  const [persisting, setPersisting] = useState(false);

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
  const tab = normalizeStage(searchParams.get("stage")) || (legacyBoard ? "Storyboard" : "Setup");

  useEffect(() => {
    if (!realProject || tab !== "Storyboard") return undefined;
    let cancelled = false;

    async function loadScenes() {
      setSceneLoading(true);
      setSceneError("");
      try {
        const response = await fetch(`/api/projects/${id}/scenes`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Failed to load storyboard.");
        if (cancelled) return;

        if (data.scenes?.length) {
          setScenes(data.scenes);
          setSelectedAssetByScene(Object.fromEntries(data.scenes.map((scene) => {
            const selected = scene.assets.findIndex((asset) => asset.isSelected);
            return [scene.id, selected >= 0 ? selected : 0];
          })));
          return;
        }

        const generateResponse = await fetch(`/api/projects/${id}/generate-scenes`, { method: "POST" });
        const generated = await generateResponse.json().catch(() => ({}));
        if (!generateResponse.ok) throw new Error(generated.error || "Failed to generate storyboard.");
        if (cancelled) return;
        setScenes(generated.scenes || []);
        setSelectedAssetByScene(Object.fromEntries((generated.scenes || []).map((scene) => [scene.id, 0])));
      } catch (error) {
        if (!cancelled) setSceneError(error.message || "Failed to generate storyboard.");
      } finally {
        if (!cancelled) setSceneLoading(false);
      }
    }

    loadScenes();
    return () => { cancelled = true; };
  }, [id, realProject, tab, sceneRetry]);

  function changeTab(nextTab) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("stage", nextTab.toLowerCase());
    setSearchParams(nextParams, { replace: true });
  }

  async function persistSelections() {
    if (!scenes.length) return true;
    setPersisting(true);
    setSceneError("");
    try {
      await Promise.all(scenes.map(async (scene) => {
        const index = selectedAssetByScene[scene.id] ?? 0;
        const asset = scene.assets[index] || scene.assets[0];
        if (!asset) return;
        const response = await fetch(`/api/scenes/${scene.id}/select-asset`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId: asset.id }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Failed to save a visual selection.");
      }));
      return true;
    } catch (error) {
      setSceneError(error.message || "Failed to save visual selections.");
      return false;
    } finally {
      setPersisting(false);
    }
  }

  async function goToPreview() {
    if (realProject) {
      const saved = await persistSelections();
      if (!saved) return;
    }
    changeTab("Preview");
  }

  function selectAsset(sceneId, index) {
    setSelectedAssetByScene((current) => ({ ...current, [sceneId]: index }));
  }

  const activeSceneStep = useMemo(() => {
    if (!scenes.length) return null;
    const scene = scenes[activeStep] || scenes[0];
    return sceneToStep(scene, selectedAssetByScene[scene.id] ?? 0);
  }, [activeStep, scenes, selectedAssetByScene]);

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
                <button key={t.label} role="tab" aria-selected={tab === t.label} className={`hx-tab ${tab === t.label ? "is-active" : ""}`} onClick={() => (t.label === "Preview" ? goToPreview() : changeTab(t.label))} disabled={persisting}>
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
              <div className="setup-actions"><button className="btn btn-cream" onClick={() => changeTab("Setup")}>Continue to setup <IconArrowRight className="btn-icon" /></button></div>
            </section>
          )}

          {tab === "Setup" && <SetupPanel projectId={id} onComplete={(updated) => { setProject((current) => ({ ...current, ...updated })); changeTab("Storyboard"); }} />}

          {tab === "Storyboard" && (
            <section className="hx-board__layout hx-board__layout--real">
              <PhonePreview
                step={activeSceneStep}
                duration={project.setup?.length ? `${project.setup.length}s` : `${Math.round(project.durationSeconds || 0)}s`}
                cuts={scenes.length || project.cuts || 0}
                playing={playing}
                onTogglePlay={() => setPlaying((p) => !p)}
              />
              <div className="hx-board__content">
                <div className="hx-hookbox"><IconInfo className="hx-hookbox__icon" /><p><span className="mono-label">HOOK</span> {scenes[0]?.spokenText || "Helix is building the first scene…"}</p></div>
                {sceneError && <div className="storyboard-error"><strong>Storyboard couldn't load.</strong><span>{sceneError}</span><button className="btn btn-ghost" onClick={() => setSceneRetry((value) => value + 1)}>Retry</button></div>}
                {sceneLoading && <div className="storyboard-loading"><span className="eyebrow">Generating storyboard</span><strong>Helix is writing the scenes and fetching five visuals per cut…</strong></div>}
                {!sceneLoading && !sceneError && scenes.length > 0 && (
                  <>
                    <div className="hx-steps">
                      {scenes.map((scene, i) => <StepCard
                        key={scene.id}
                        step={sceneToStep(scene, selectedAssetByScene[scene.id] ?? 0)}
                        active={activeStep === i}
                        selectedAssetIndex={selectedAssetByScene[scene.id] ?? 0}
                        onFocus={() => { setActiveStep(i); setPlaying(false); }}
                        onSelectAsset={(index) => selectAsset(scene.id, index)}
                      />)}
                    </div>
                    <div className="hx-board__actions">
                      <button className="btn btn-ghost" onClick={() => changeTab("Setup")}><IconArrowLeft className="btn-icon" /> Back to setup</button>
                      <button className="btn btn-cream" onClick={goToPreview} disabled={persisting}>{persisting ? "Saving visuals…" : "Finalize preview →"}</button>
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

          {tab === "Preview" && (
            <section className="research-brief">
              <p className="eyebrow">Finalize</p>
              <h2>Storyboard ready for finalization.</h2>
              <p>{scenes.length} scenes generated with five pre-fetched visual options per scene. Your selected visuals have been saved.</p>
              <div className="setup-actions"><button className="btn btn-ghost" onClick={() => changeTab("Storyboard")}>Back to storyboard</button></div>
            </section>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="hx-page">
      <Header right={<Link to="/" className="btn btn-ghost"><IconArrowLeft className="btn-icon" /> Signals</Link>} />
      <main className="container hx-board">
        <div className="hx-board__head">
          <div><p className="eyebrow">{board.framework} · {board.frameworkName}</p><h1 className="hx-board__title">{board.title}</h1></div>
          <div className="hx-tabs" role="tablist" aria-label="Storyboard stage">
            <button className={`hx-tab ${tab === "Storyboard" ? "is-active" : ""}`} onClick={() => changeTab("Storyboard")}><span className="mono-label hx-tab__n">02</span> Storyboard</button>
            <button className={`hx-tab ${tab === "Preview" ? "is-active" : ""}`} onClick={() => changeTab("Preview")}><span className="mono-label hx-tab__n">03</span> Preview</button>
          </div>
        </div>
        <div className="hx-board__layout">
          <PhonePreview step={board.steps[activeStep]} duration={board.duration} cuts={board.cuts} playing={playing} onTogglePlay={() => setPlaying((p) => !p)} />
          <div className="hx-board__content">
            {tab === "Storyboard" && <>
              <div className="hx-hookbox"><IconInfo className="hx-hookbox__icon" /><p><span className="mono-label">HOOK</span> {board.hook}</p></div>
              <div className="hx-steps">{board.steps.map((step, i) => <StepCard key={step.n} step={step} active={activeStep === i} onFocus={() => { setActiveStep(i); setPlaying(false); }} />)}</div>
              <div className="hx-board__actions"><button className="btn btn-ghost" onClick={() => navigate("/")}><IconArrowLeft className="btn-icon" /> Back</button><button className="btn btn-cream" onClick={() => changeTab("Preview")}>Preview &amp; publish pack <IconArrowRight className="btn-icon" /></button></div>
            </>}
            {tab === "Preview" && (published ? <div className="hx-published"><span className="hx-published__icon"><IconCheck /></span><h3>Reel pack published</h3><p>"{board.title}" is queued for export at {board.duration}, {board.cuts} cuts.</p><div className="hx-board__actions" style={{ justifyContent: "center", gap: 12 }}><button className="btn btn-ghost" onClick={() => setPublished(false)}><IconArrowLeft className="btn-icon" /> Back to preview</button><button className="btn btn-cream" onClick={() => navigate("/")}>Done</button></div></div> : <div className="hx-published"><h3>Preview &amp; publish pack</h3><p>Legacy demo storyboard preview.</p><button className="btn btn-cream" onClick={() => setPublished(true)}>Publish pack</button></div>)}
          </div>
        </div>
      </main>
    </div>
  );
}
