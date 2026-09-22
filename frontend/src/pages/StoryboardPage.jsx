import { useEffect, useMemo, useState } from "react";
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read audio file."));
    reader.readAsDataURL(file);
  });
}

function sceneToStep(scene, selectedAssetIndex = 0) {
  const selectedAsset = scene.assets?.[selectedAssetIndex] || scene.assets?.[0];
  return {
    id: scene.id,
    n: String(scene.sceneOrder).padStart(2, "0"),
    title: scene.title,
    line: scene.spokenText,
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
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [renderLoading, setRenderLoading] = useState(false);
  const [renderError, setRenderError] = useState("");
  const [renderStatus, setRenderStatus] = useState(null);
  const [ttsVoices, setTtsVoices] = useState([]);
  const [ttsDiagnostics, setTtsDiagnostics] = useState(null);
  const [ttsEngine, setTtsEngine] = useState("kokoro");
  const [ttsVoiceId, setTtsVoiceId] = useState("");
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [voiceName, setVoiceName] = useState("");
  const [voiceReferenceText, setVoiceReferenceText] = useState("");
  const [voiceReferenceFile, setVoiceReferenceFile] = useState(null);
  const [voiceSaving, setVoiceSaving] = useState(false);

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
    if (!realProject || !["Storyboard", "Preview"].includes(tab)) return undefined;
    let cancelled = false;

    async function loadTtsConfig() {
      const [voicesResponse, diagnosticsResponse] = await Promise.all([
        fetch("/api/tts/voices"),
        fetch("/api/tts/diagnostics"),
      ]);

      const voices = await voicesResponse.json().catch(() => ({}));
      const diagnostics = await diagnosticsResponse.json().catch(() => ({}));
      if (cancelled) return;

      if (voicesResponse.ok) {
        const nextVoices = Array.isArray(voices.voices) ? voices.voices : [];
        setTtsVoices(nextVoices);
        if (!ttsVoiceId && nextVoices[0]?.voice_id) setTtsVoiceId(nextVoices[0].voice_id);
      }
      if (diagnosticsResponse.ok) {
        setTtsDiagnostics(diagnostics);
        if (diagnostics?.defaultEngine) setTtsEngine((current) => current || diagnostics.defaultEngine);
      }
    }

    loadTtsConfig().catch(() => {
      if (!cancelled) setTtsDiagnostics({ configured: false, reachable: false });
    });

    return () => { cancelled = true; };
  }, [realProject, tab, id]);

  async function saveClonedVoice() {
    if (!voiceName.trim() || !voiceReferenceFile || voiceSaving) return;
    setVoiceSaving(true);
    setVoiceError("");
    try {
      const referenceAudioBase64 = await readFileAsDataUrl(voiceReferenceFile);
      const response = await fetch("/api/tts/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: voiceName.trim(),
          referenceAudioBase64,
          referenceText: voiceReferenceText.trim(),
          preferredEngine: ttsEngine === "qwen3-tts-0.6b" ? "qwen3-tts-0.6b" : "chatterbox-nano",
          fileName: voiceReferenceFile.name,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to save cloned voice.");
      setTtsVoices((current) => [data, ...current]);
      setTtsVoiceId(data.voice_id || "");
      setVoiceName("");
      setVoiceReferenceText("");
      setVoiceReferenceFile(null);
      setVoicePanelOpen(false);
    } catch (error) {
      setVoiceError(error.message || "Failed to save cloned voice.");
    } finally {
      setVoiceSaving(false);
    }
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

  async function generateVoice() {
    if (!scenes.length || voiceLoading) return;
    const cloneEngineSelected = ttsEngine === "chatterbox-nano" || ttsEngine === "qwen3-tts-0.6b";
    setVoiceLoading(true);
    setVoiceError("");
    try {
      const response = await fetch(`/api/projects/${id}/generate-voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engine: ttsEngine,
          voiceId: cloneEngineSelected ? (ttsVoiceId || undefined) : undefined,
          language: project?.language || "English",
          allowFallback: true,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to generate narration.");
      setScenes(data.scenes || []);
      setProject((current) => ({ ...current, durationSeconds: data.durationSeconds ?? current?.durationSeconds }));
      setPlaying(false);
    } catch (error) {
      setVoiceError(error.message || "Failed to generate narration.");
    } finally {
      setVoiceLoading(false);
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
              <p className="eyebrow">{tab === "Preview" ? "Finalize & export" : project.status === "storyboard" ? "Setup locked" : "Research complete"}</p>
              <h1 className="hx-board__title">{project.title}</h1>
            </div>
            <div className="hx-tabs" role="tablist" aria-label="Reel stages">
              {TABS.map((t) => (
                <button key={t.label} role="tab" aria-selected={tab === t.label} className={`hx-tab ${tab === t.label ? "is-active" : ""}`} onClick={() => (t.label === "Preview" ? goToPreview() : changeTab(t.label))} disabled={persisting || voiceLoading || renderLoading}>
                  <span className="mono-label hx-tab__n">{t.n}</span> {t.label}
                </button>
              ))}
            </div>
          </div>

          {tab === "Research" && <ResearchReport projectId={id} project={project} onContinueSetup={() => changeTab("Setup")} />}

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
                {voiceError && <div className="storyboard-error"><strong>Narration couldn't be generated.</strong><span>{voiceError}</span></div>}
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
                    <div className="hx-tts-panel">
                      <div className="hx-tts-panel__head">
                        <div>
                          <span className="eyebrow">Narration engine</span>
                          <strong>Self-hosted TTS</strong>
                        </div>
                        <span className={`hx-tts-status ${ttsDiagnostics?.reachable ? "is-ready" : "is-offline"}`}>
                          {ttsDiagnostics?.reachable ? "Service ready" : "Service unavailable"}
                        </span>
                      </div>
                      <div className="hx-tts-panel__controls">
                        <label>
                          Engine
                          <select value={ttsEngine} onChange={(event) => {
                            const nextEngine = event.target.value;
                            setTtsEngine(nextEngine);
                            if (nextEngine !== "chatterbox-nano" && nextEngine !== "qwen3-tts-0.6b") setTtsVoiceId("");
                            else if (!ttsVoiceId && ttsVoices[0]?.voice_id) setTtsVoiceId(ttsVoices[0].voice_id);
                          }} disabled={voiceLoading}>
                            <option value="kokoro">Kokoro-82M</option>
                            <option value="melotts-v3">MeloTTS v3</option>
                            <option value="chatterbox-nano">Chatterbox-Nano</option>
                            <option value="qwen3-tts-0.6b">Qwen3-TTS 0.6B</option>
                          </select>
                        </label>
{(ttsEngine === "chatterbox-nano" || ttsEngine === "qwen3-tts-0.6b") ? (
                          <label>
                            Voice profile
                            <select value={ttsVoiceId} onChange={(event) => setTtsVoiceId(event.target.value)} disabled={voiceLoading}>
                              <option value="">Select cloned voice</option>
                              {ttsVoices.map((voice) => (
                                <option key={voice.voice_id} value={voice.voice_id}>{voice.name}</option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                      </div>
                      {ttsEngine === "chatterbox-nano" || ttsEngine === "qwen3-tts-0.6b" ? (
                        <div className="hx-tts-panel__clone">
                          {!ttsVoiceId ? <span className="hx-tts-panel__required">Select or create a cloned voice before generating.</span> : null}
                          <div>
                            <strong>Voice cloning</strong>
                            <span>Use an authorized reference recording for a consistent narrator voice.</span>
                          </div>
                          <button className="btn btn-ghost" type="button" onClick={() => setVoicePanelOpen((open) => !open)}>
                            {voicePanelOpen ? "Close" : "Add cloned voice"}
                          </button>
                        </div>
                      ) : null}
                      {voicePanelOpen && (
                        <div className="hx-tts-clone-form">
                          <label>
                            Voice name
                            <input value={voiceName} onChange={(event) => setVoiceName(event.target.value)} placeholder="Construction Narrator" />
                          </label>
                          <label>
                            Reference audio
                            <input type="file" accept="audio/*" onChange={(event) => setVoiceReferenceFile(event.target.files?.[0] || null)} />
                          </label>
                          <label>
                            Reference transcript
                            <textarea value={voiceReferenceText} onChange={(event) => setVoiceReferenceText(event.target.value)} placeholder="Optional, but recommended for Qwen3-TTS." rows={3} />
                          </label>
                          <div className="hx-tts-clone-form__actions">
                            <button className="btn btn-cream" type="button" onClick={saveClonedVoice} disabled={voiceSaving || !voiceName.trim() || !voiceReferenceFile}>
                              {voiceSaving ? "Saving voice…" : "Save voice"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="hx-board__actions">
                      <button className="btn btn-ghost" onClick={() => changeTab("Setup")}><IconArrowLeft className="btn-icon" /> Back to setup</button>
                      <div className="hx-board__actions-group">
                        <button className="btn btn-ghost" onClick={generateVoice} disabled={voiceLoading || ((ttsEngine === "chatterbox-nano" || ttsEngine === "qwen3-tts-0.6b") && !ttsVoiceId)}>
                          {voiceLoading ? "Generating narration…" : "Generate narration"}
                        </button>
                        <button className="btn btn-cream" onClick={goToPreview} disabled={persisting || voiceLoading}>{persisting ? "Saving visuals…" : "Finalize preview →"}</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>
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
