import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import PhonePreview from "../components/PhonePreview";
import StepCard from "../components/StepCard";
import SetupPanel from "../components/SetupPanel";
import FinalizePanel from "../components/FinalizePanel";
import ResearchReport from "../components/ResearchReport";
import { IconArrowLeft, IconInfo } from "../components/Icons";
import "../components/ui.css";
import "../components/SetupPanel.css";
import "../pages/ResearchStageUX.css";
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
    spokenText: scene.spokenText,
    time: formatDuration(scene.durationSeconds),
    durationSeconds: Number(scene.durationSeconds || 0),
    audioUrl: scene.audioUrl,
    wordTimestamps: scene.wordTimestamps || [],
    whyLine: scene.whyLine || "Helix uses the strongest evidence-led line for this beat.",
    whyPicture: scene.whyPicture || "The visual makes the mechanism concrete before the next cut.",
    thumb: selectedAsset ? `url(${selectedAsset.thumbnailUrl}) center / cover no-repeat` : "linear-gradient(145deg, #17304a, #09131f)",
    thumbLabel: selectedAsset ? "Pexels B-roll" : "Visual pending",
    swatches: (scene.assets || []).map((asset) => `url(${asset.thumbnailUrl}) center / cover no-repeat`),
    selectedAsset,
    customization: scene.customization || null,
  };
}

export default function StoryboardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [project, setProject] = useState(null);
  const [projectLoading, setProjectLoading] = useState(true);
  const [scenes, setScenes] = useState([]);
  const [activeStep, setActiveStep] = useState(0);
  const [selectedAssetByScene, setSelectedAssetByScene] = useState({});
  const [playing, setPlaying] = useState(false);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [sceneError, setSceneError] = useState("");
  const [sceneRetry, setSceneRetry] = useState(0);
  const [persisting, setPersisting] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [renderLoading, setRenderLoading] = useState(false);
  const [renderError, setRenderError] = useState("");
  const [renderStatus, setRenderStatus] = useState(null);
  const [setupDirty, setSetupDirty] = useState(false);
  const [voiceProfiles, setVoiceProfiles] = useState([]);
  const [predefinedVoices, setPredefinedVoices] = useState([]);
  const [customizingSceneId, setCustomizingSceneId] = useState(null);
  const [sceneAction, setSceneAction] = useState({ id: "", type: "" });
  const [sceneEditError, setSceneEditError] = useState("");
  const [previewingSceneVoice, setPreviewingSceneVoice] = useState("");
  const [previewLoadingSceneVoice, setPreviewLoadingSceneVoice] = useState("");
  const sceneVoiceAudioRef = useRef(null);
  const sceneVoiceRequestRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function loadProject() {
      try {
        const response = await fetch(`/api/projects/${id}/research`);
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setProject(data.project);
      } catch {
        // Leaves `project` null; the not-found guard below handles this.
      } finally {
        if (!cancelled) setProjectLoading(false);
      }
    }
    loadProject();
    return () => { cancelled = true; };
  }, [id]);

  const realProject = Boolean(project);
  const tab = normalizeStage(searchParams.get("stage")) || "Setup";

  useEffect(() => {
    if (!realProject || !["Storyboard", "Preview"].includes(tab)) return undefined;
    let cancelled = false;

    async function loadScenes() {
      setSceneLoading(true);
      setSceneError("");
      setVoiceError("");
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

  useEffect(() => {
    if (!realProject || tab !== "Storyboard") return undefined;
    let cancelled = false;
    async function loadVoices() {
      try {
        const [profilesResponse, presetsResponse] = await Promise.all([
          fetch("/api/voice-profiles"),
          fetch("/api/voice-presets"),
        ]);
        const profilesData = await profilesResponse.json().catch(() => ({}));
        const presetsData = await presetsResponse.json().catch(() => ({}));
        if (!profilesResponse.ok) throw new Error(profilesData.error || "Failed to load voice profiles.");
        if (!presetsResponse.ok) throw new Error(presetsData.error || "Failed to load predefined voices.");
        if (cancelled) return;
        setVoiceProfiles(Array.isArray(profilesData.profiles)
          ? profilesData.profiles.filter((profile) => profile.status === "ready" && profile.ttsVoiceId)
          : []);
        setPredefinedVoices(Array.isArray(presetsData.voices) ? presetsData.voices : []);
      } catch (error) {
        if (!cancelled) setSceneEditError(error.message || "Failed to load narration voices.");
      }
    }
    void loadVoices();
    return () => { cancelled = true; };
  }, [realProject, tab]);

  useEffect(() => () => {
    sceneVoiceRequestRef.current?.abort();
    sceneVoiceAudioRef.current?.pause();
    sceneVoiceAudioRef.current = null;
  }, []);

  const sceneVoiceOptions = useMemo(() => [
    ...voiceProfiles.map((profile) => ({
      source: "clone",
      id: profile.id,
      name: profile.name,
      language: profile.language || "English",
      engine: profile.preferredEngine === "qwen3-tts-0.6b" ? "Qwen3-TTS 0.6B" : "Chatterbox-Nano",
      description: "Your cloned voice",
      accent: "",
      gender: "",
      tone: "",
    })),
    ...predefinedVoices.map((voice) => ({
      source: "preset",
      id: voice.id,
      name: voice.name,
      language: voice.language || "English",
      engine: voice.engine,
      description: voice.description,
      accent: voice.accent,
      gender: voice.gender,
      tone: voice.tone,
    })),
  ], [voiceProfiles, predefinedVoices]);

  const projectSceneSetup = useMemo(() => {
    const setupVoice = project?.setup?.voiceProfileId
      ? sceneVoiceOptions.find((voice) => voice.source === "clone" && voice.id === project.setup.voiceProfileId)
      : sceneVoiceOptions.find((voice) => voice.source === "preset" && voice.id === project?.setup?.voicePresetId);
    return {
      framework: project?.setup?.framework || "how-it-works",
      tone: project?.setup?.tone || "Conversational",
      audienceLevel: project?.setup?.audienceLevel || "General public",
      voice: setupVoice || null,
    };
  }, [project, sceneVoiceOptions]);

  function sceneActionFor(sceneId) {
    return sceneAction.id === sceneId ? sceneAction.type : "";
  }

  async function previewSceneVoice(voice) {
    const key = voice.source + ":" + voice.id;
    if (previewingSceneVoice === key || previewLoadingSceneVoice === key) {
      sceneVoiceRequestRef.current?.abort();
      sceneVoiceRequestRef.current = null;
      sceneVoiceAudioRef.current?.pause();
      sceneVoiceAudioRef.current = null;
      setPreviewingSceneVoice("");
      setPreviewLoadingSceneVoice("");
      return;
    }
    sceneVoiceRequestRef.current?.abort();
    sceneVoiceAudioRef.current?.pause();
    sceneVoiceAudioRef.current = null;
    setPreviewingSceneVoice("");
    setPreviewLoadingSceneVoice(key);
    const controller = new AbortController();
    sceneVoiceRequestRef.current = controller;
    try {
      const endpoint = voice.source === "clone"
        ? "/api/voice-profiles/" + encodeURIComponent(voice.id) + "/preview"
        : "/api/voice-presets/" + encodeURIComponent(voice.id) + "/preview";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to preview this voice.");
      const audio = new Audio("data:" + (data.mimeType || "audio/wav") + ";base64," + data.audioBase64);
      sceneVoiceAudioRef.current = audio;
      audio.onended = () => {
        if (sceneVoiceAudioRef.current === audio) {
          sceneVoiceAudioRef.current = null;
          setPreviewingSceneVoice("");
        }
      };
      audio.onerror = () => {
        if (sceneVoiceAudioRef.current === audio) {
          sceneVoiceAudioRef.current = null;
          setPreviewingSceneVoice("");
          setSceneEditError("This voice preview could not be played.");
        }
      };
      await audio.play();
      if (sceneVoiceRequestRef.current !== controller) {
        audio.pause();
        return;
      }
      sceneVoiceRequestRef.current = null;
      setPreviewLoadingSceneVoice("");
      setPreviewingSceneVoice(key);
    } catch (error) {
      if (error?.name !== "AbortError") {
        setPreviewLoadingSceneVoice("");
        setPreviewingSceneVoice("");
        setSceneEditError(error.message || "Failed to preview this voice.");
      }
    }
  }

  async function runSceneAction(sceneId, type, endpoint, body) {
    setSceneAction({ id: sceneId, type });
    setSceneEditError("");
    try {
      const response = await fetch(endpoint, {
        method: type === "voice" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error(data.error || "AI quota is temporarily exhausted. Please retry after the Gemini quota window resets.");
        }
        throw new Error(data.error || "Scene update failed.");
      }
      if (data.scene) {
        setScenes((current) => current.map((scene) => scene.id === data.scene.id ? data.scene : scene));
        setSelectedAssetByScene((current) => ({
          ...current,
          [data.scene.id]: Math.max(0, (data.scene.assets || []).findIndex((asset) => asset.isSelected)),
        }));
      }
      if (data.durationSeconds != null) {
        setProject((current) => current ? { ...current, durationSeconds: data.durationSeconds, cuts: data.cuts ?? current.cuts, renderUrl: null } : current);
      }
      return true;
    } catch (error) {
      setSceneEditError(error.message || "Scene update failed.");
      return false;
    } finally {
      setSceneAction({ id: "", type: "" });
    }
  }

  async function rewriteScene(sceneId, options) {
    return runSceneAction(sceneId, options.refreshVisuals ? "rewrite-visuals" : "rewrite", "/api/scenes/" + encodeURIComponent(sceneId) + "/rewrite", options);
  }

  async function changeSceneVoice(sceneId, voice) {
    return runSceneAction(sceneId, "voice", "/api/scenes/" + encodeURIComponent(sceneId) + "/voice", voice.source === "clone" ? { voiceProfileId: voice.id } : { voicePresetId: voice.id });
  }

  async function regenerateSceneVisuals(sceneId, query = "") {
    return runSceneAction(sceneId, "visuals", "/api/scenes/" + encodeURIComponent(sceneId) + "/regenerate-assets", query ? { query } : {});
  }



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

  async function renderProject() {
    if (renderLoading) return;
    setRenderLoading(true);
    setRenderError("");
    setRenderStatus(null);

    try {
      const saved = await persistSelections();
      if (!saved) throw new Error("Save visual selections before rendering.");

      const response = await fetch(`/api/projects/${id}/render`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to queue render.");
      setRenderStatus(data);

      if (data.status === "completed" && data.renderUrl) return;

      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const statusResponse = await fetch(`/api/projects/${id}/render-status`);
        const statusData = await statusResponse.json().catch(() => ({}));
        if (!statusResponse.ok) throw new Error(statusData.error || "Failed to read render status.");
        setRenderStatus(statusData);
        if (statusData.status === "completed") break;
        if (statusData.status === "failed") throw new Error(statusData.error || "Render failed.");
      }
    } catch (error) {
      setRenderError(error.message || "Failed to render project.");
    } finally {
      setRenderLoading(false);
    }
  }

  function selectAsset(sceneId, index) {
    setSelectedAssetByScene((current) => ({ ...current, [sceneId]: index }));
  }

  const narratedSceneCount = useMemo(() => scenes.filter((scene) => Boolean(scene.audioUrl)).length, [scenes]);
  const customizedSceneCount = useMemo(() => scenes.filter((scene) => Boolean(scene.customization?.customized)).length, [scenes]);

  const activeSceneStep = useMemo(() => {
    if (!scenes.length) return null;
    const scene = scenes[activeStep] || scenes[0];
    return sceneToStep(scene, selectedAssetByScene[scene.id] ?? 0);
  }, [activeStep, scenes, selectedAssetByScene]);

  if (projectLoading) {
    return (
      <div className="hx-page">
        <Header right={<Link to="/" className="btn btn-ghost"><IconArrowLeft className="btn-icon" /> Signals</Link>} />
        <div className="container hx-notfound">
          <p>Loading your reel project…</p>
        </div>
      </div>
    );
  }

  if (!realProject) {
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
              <p className="eyebrow">{tab === "Preview" ? "Finalize & export" : tab === "Setup" ? "Configure storyboard" : tab === "Storyboard" ? "Storyboard ready" : "Research complete"}</p>
              <h1 className="hx-board__title">{project.title}</h1>
            </div>
            <div className="hx-tabs" role="tablist" aria-label="Reel stages">
              {TABS.map((t) => (
                <button key={t.label} role="tab" aria-selected={tab === t.label} className={`hx-tab ${tab === t.label ? "is-active" : ""}`} onClick={() => (t.label === "Preview" ? goToPreview() : changeTab(t.label))} disabled={persisting || renderLoading || (setupDirty && t.label !== "Setup")}>
                  <span className="mono-label hx-tab__n">{t.n}</span> {t.label}
                </button>
              ))}
            </div>
          </div>

          {tab === "Research" && <ResearchReport projectId={id} project={project} onContinueSetup={() => changeTab("Setup")} />}

          {tab === "Setup" && <SetupPanel
            projectId={id}
            onDirtyChange={setSetupDirty}
            onComplete={(updated) => {
              setProject((current) => ({ ...current, ...updated }));
              setSetupDirty(false);
              changeTab("Storyboard");
            }}
          />}

          {tab === "Storyboard" && (
            <>
              <section className="storyboard-editor-intro">
                <div className="storyboard-editor-intro__copy">
                  <p className="eyebrow">Storyboard editor</p>
                  <h2>Review every cut, then tune only what needs changing.</h2>
                  <p>Each scene inherits the project Setup. Customize a single scene without regenerating the rest of the storyboard.</p>
                </div>
                <div className="storyboard-editor-intro__stats" aria-label="Storyboard summary">
                  <span><strong>{scenes.length}</strong><small>Scenes</small></span>
                  <span><strong>{narratedSceneCount}</strong><small>Narrated</small></span>
                  <span><strong>{scenes.length * 5}</strong><small>Visuals</small></span>
                  <span><strong>{customizedSceneCount}</strong><small>Customized</small></span>
                </div>
              </section>
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
                {voiceError && <div className="storyboard-error"><strong>Narration couldn't be generated.</strong><span>{voiceError}</span></div>}
                {sceneEditError && <div className="storyboard-error storyboard-error--scene"><strong>Scene update couldn't be applied.</strong><span>{sceneEditError}</span></div>}
                {sceneLoading && <div className="storyboard-loading"><span className="eyebrow">Generating storyboard</span><strong>Helix is writing the scenes, fetching five visuals per cut, and generating narration with your selected voice…</strong></div>}
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
                        customizeOpen={customizingSceneId === scene.id}
                        onToggleCustomize={() => setCustomizingSceneId((current) => current === scene.id ? null : scene.id)}
                        onCloseCustomize={() => setCustomizingSceneId(null)}
                        customSetup={projectSceneSetup}
                        voices={sceneVoiceOptions}
                        onPreviewVoice={previewSceneVoice}
                        previewingVoice={previewingSceneVoice}
                        previewLoading={previewLoadingSceneVoice}
                        onRewriteScene={(options) => rewriteScene(scene.id, options)}
                        onChangeSceneVoice={(voice) => changeSceneVoice(scene.id, voice)}
                        onRegenerateVisuals={(query) => regenerateSceneVisuals(scene.id, query)}
                        sceneBusy={sceneActionFor(scene.id)}
                      />)}
                    </div>
                    <div className="storyboard-narration-status">
                      <span className="eyebrow">Narration</span>
                      <strong>{scenes.every((scene) => scene.audioUrl) ? "Generated with your selected voice" : "Narration pending"}</strong>
                      <span>{scenes.every((scene) => scene.audioUrl) ? "Every scene has synchronized narration and word timings." : "Return to Setup to select a narration voice."}</span>
                    </div>
                    <div className="hx-board__actions">
                      <button className="btn btn-ghost" onClick={() => changeTab("Setup")}><IconArrowLeft className="btn-icon" /> Back to setup</button>
                      <div className="hx-board__actions-group">
                        <button className="btn btn-cream" onClick={goToPreview} disabled={persisting}>{persisting ? "Saving visuals…" : "Finalize preview →"}</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              </section>
            </>
          )}

          {tab === "Preview" && (
            <FinalizePanel
              projectId={id}
              project={project}
              scenes={scenes}
              renderStatus={renderStatus}
              renderLoading={renderLoading}
              renderError={renderError}
              onRender={renderProject}
              onBack={() => changeTab("Storyboard")}
            />
          )}
        </main>
      </div>
    );
  }
}
