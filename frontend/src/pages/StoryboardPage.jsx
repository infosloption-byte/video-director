import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import RenderQuota from "../components/RenderQuota";
import { useRenderQuota } from "../hooks/useRenderQuota";
import PhonePreview from "../components/PhonePreview";
import StepCard from "../components/StepCard";
import { websiteAiFallbackReason, websiteVisualStatus } from "../utils/websiteVisualStatus";
import SetupPanel from "../components/SetupPanel";
import FinalizePanel from "../components/FinalizePanel";
import ResearchReport from "../components/ResearchReport";
import { IconArrowLeft, IconInfo } from "../components/Icons";
import "../components/ui.css";
import "../components/SetupPanel.css";
import "../pages/ResearchStageUX.css";
import "./StoryboardPage.css";

// Account/model/quota failures are shared by all scenes. Stop the paid batch
// instead of repeatedly submitting requests that cannot succeed.
const AI_BATCH_STOP_CODES = new Set([
  "IMAGE_RATE_LIMITED", "IMAGE_AUTH_FAILED", "IMAGE_MODEL_UNAVAILABLE",
  "IMAGE_PROVIDER_REJECTED", "AI_IMAGES_DISABLED",
]);

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
    whyLine: scene.whyLine || "Voxora uses the strongest evidence-led line for this beat.",
    whyPicture: scene.whyPicture || "The visual makes the mechanism concrete before the next cut.",
    thumb: selectedAsset ? `url(${selectedAsset.thumbnailUrl}) center / cover no-repeat` : "linear-gradient(145deg, #17304a, #09131f)",
    thumbLabel: selectedAsset ? (scene.customization?.sceneVisualPlan?.aiStatus === "generated" ? "Gemini AI image" : scene.customization?.sceneVisualPlan ? "Local branded layout" : "Pexels B-roll") : "Visual pending",
    swatches: (scene.assets || []).map((asset) => `url(${asset.thumbnailUrl}) center / cover no-repeat`),
    selectedAsset,
    assets: scene.assets || [],
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
  const [brandVisualLoading, setBrandVisualLoading] = useState(false);
  const [aiImageStatus, setAiImageStatus] = useState({ enabled:false, model:null });
  const [aiVisualProgress, setAiVisualProgress] = useState(null);
  const [aiVisualNotice, setAiVisualNotice] = useState("");
  const [sceneError, setSceneError] = useState("");
  const [sceneRetry, setSceneRetry] = useState(0);
  const [persisting, setPersisting] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [narrationSummary, setNarrationSummary] = useState(null);
  const { quota, quotaError, loading: quotaLoading, refresh: refreshQuota } = useRenderQuota();
  const [quotaBlocked, setQuotaBlocked] = useState(false);
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

  useEffect(() => {
    if (!project?.research?.sources?.websiteMarketing) return;
    let cancelled = false;
    fetch("/api/marketing-visuals/status").then(response => response.ok ? response.json() : {})
      .then(data => { if (!cancelled) setAiImageStatus({ enabled:data.enabled === true, model:data.model || null }); })
      .catch(() => { if (!cancelled) setAiImageStatus({ enabled:false, model:null }); });
    return () => { cancelled = true; };
  }, [project?.research?.sources?.websiteMarketing]);

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
        if (type === "visuals" && body?.visualMode === "ai" && data.code) {
          throw new Error(websiteAiFallbackReason(data.code) +
            " Your previous scene image remains unchanged.");
        }
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
      return data;
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


  async function changeSceneVoice(sceneId, voice, narration) {
    const body = voice.source === "clone"
      ? { voiceProfileId: voice.id }
      : { voicePresetId: voice.id };
    if (typeof narration === "string" && narration.trim()) body.text = narration.trim();
    return runSceneAction(sceneId, "voice", "/api/scenes/" + encodeURIComponent(sceneId) + "/voice", body);
  }

  async function regenerateSceneVisuals(sceneId, query = "", visualMode = "brand", { quiet = false } = {}) {
    const result = await runSceneAction(sceneId, "visuals", "/api/scenes/" + encodeURIComponent(sceneId) + "/regenerate-assets",
      { ...(query ? { query } : {}), visualMode });
    if (result && !quiet && project?.research?.sources?.websiteMarketing) {
      setAiVisualNotice(websiteVisualStatus(result.scene?.customization?.sceneVisualPlan));
    }
    return result;
  }

  async function confirmAiSceneImage(sceneId) {
    if (!aiImageStatus.enabled || brandVisualLoading || aiVisualProgress || renderLoading || sceneLoading) return;
    if (typeof window !== "undefined" && !window.confirm(
      "Generate a paid Gemini AI image for this scene? Provider charges may apply. Narration and timing will remain unchanged."
    )) return;
    setAiVisualNotice("");
    await regenerateSceneVisuals(sceneId, "", "ai");
  }

  async function generateAiImagesForScenes() {
    if (!aiImageStatus.enabled || aiVisualProgress || brandVisualLoading || renderLoading || sceneLoading) return;
    const pendingScenes = scenes.filter(scene => scene.customization?.sceneVisualPlan?.aiStatus !== "generated");
    if (!pendingScenes.length) {
      setAiVisualNotice("All scenes already have verified Gemini AI illustrations.");
      return;
    }
    if (typeof window !== "undefined" && !window.confirm(
      "Generate " + pendingScenes.length + " Gemini AI image(s) to replace placeholder layouts? " +
      "Your image provider may charge for each request. Completed AI scenes will not be charged again. " +
      "Narration and timing will not change."
    )) return;
    setSceneEditError("");
    setAiVisualNotice("");
    let generated = 0, fallback = 0, done = 0;
    let stopped = false;
    const fallbackDetails = [];
    setAiVisualProgress({ done:0, total:pendingScenes.length });
    for (const scene of pendingScenes) {
      const result = await regenerateSceneVisuals(scene.id, "", "ai", { quiet: true });
      if (!result) {
        stopped = true;
        setAiVisualNotice("AI image generation stopped after " + done +
          " scenes. Previous scene images were preserved on failure. Review the error above.");
        break;
      }
      const plan = result.scene?.customization?.sceneVisualPlan;
      if (plan?.aiStatus === "generated") generated++;
      else {
        fallback++;
        fallbackDetails.push("Scene " + scene.sceneOrder + ": " + websiteAiFallbackReason(plan?.aiFallbackCode));
      }
      done++;
      setAiVisualProgress({ done, total:pendingScenes.length });
      if (plan?.aiStatus === "fallback" && AI_BATCH_STOP_CODES.has(plan.aiFallbackCode)) {
        stopped = true;
        setAiVisualNotice("AI generation stopped after scene " + scene.sceneOrder +
          " to avoid repeated paid requests: " + websiteAiFallbackReason(plan.aiFallbackCode) +
          " Completed " + generated + " Gemini images and " + fallback + " local fallbacks.");
        break;
      }
    }
    if (!stopped && done === pendingScenes.length) {
      setAiVisualNotice(generated + " new Gemini AI scene images created; " + fallback +
        " used local FFmpeg fallback. Original narration and timing were preserved." +
        (fallbackDetails.length ? " " + fallbackDetails.slice(0, 3).join(" ") +
          (fallbackDetails.length > 3 ? " See individual scenes for other reasons." : "") : ""));
    }
    setAiVisualProgress(null);
  }



  async function regenerateAllWebsiteVisuals() {
    if (brandVisualLoading || !project?.research?.sources?.websiteMarketing) return;
    setBrandVisualLoading(true);
    setSceneEditError("");
    try {
      const response = await fetch("/api/projects/" + encodeURIComponent(id) + "/regenerate-brand-visuals", {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to regenerate website artwork.");
      setScenes(data.scenes || []);
      setSelectedAssetByScene(Object.fromEntries((data.scenes || []).map(scene => [scene.id, 0])));
      setProject(current => ({ ...current, renderUrl: null, status: "storyboard" }));
      setAiVisualNotice("Local FFmpeg branded layouts updated for " + (data.scenes || []).length + " scenes. Gemini AI was not called.");
    } catch (error) {
      setSceneEditError(error.message || "Unable to regenerate branded visuals.");
    } finally {
      setBrandVisualLoading(false);
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

      const response = await fetch(`/api/projects/${id}/render`, { method: "POST", credentials: "include" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.code === "PLAN_LIMIT_REACHED") setQuotaBlocked(true);
        throw new Error(data.error || "Failed to queue render.");
      }
      setQuotaBlocked(false);
      await refreshQuota();
      setRenderStatus(data);

      if (data.status === "completed" && data.renderUrl) return;

      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const statusResponse = await fetch(`/api/projects/${id}/render-status`);
        const statusData = await statusResponse.json().catch(() => ({}));
        if (!statusResponse.ok) throw new Error(statusData.error || "Failed to read render status.");
        setRenderStatus(statusData);
        if (statusData.status === "completed") { await refreshQuota(); break; }
        if (statusData.status === "failed") { await refreshQuota(); throw new Error(statusData.error || "Render failed."); }
      }
    } catch (error) {
      setRenderError(error.message || "Failed to render project.");
    } finally {
      await refreshQuota();
      setRenderLoading(false);
    }
  }

  function selectAsset(sceneId, index) {
    setSelectedAssetByScene((current) => ({ ...current, [sceneId]: index }));
  }

  const narrationRevision = scenes.map((scene) => [scene.id, scene.audioUrl || ""].join(":")).join("|");
  useEffect(() => {
    if (tab !== "Storyboard" || !scenes.length) return undefined;
    let cancelled = false;
    const check = async () => {
      try {
        const response = await fetch(`/api/projects/${id}/narration-status`, { cache: "no-store", credentials: "include" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Narration status check failed");
        if (!cancelled) setNarrationSummary(data);
      } catch {
        if (!cancelled) setNarrationSummary(null);
      }
    };
    void check();
    return () => { cancelled = true; };
  }, [id, tab, narrationRevision]);
  const narratedSceneCount = narrationSummary?.readyScenes ?? scenes.filter((scene) => Boolean(scene.audioUrl)).length;
  const missingNarrationOrders = narrationSummary?.scenes?.filter((scene) => !scene.ready).map((scene) => scene.sceneOrder) || [];
  const customizedSceneCount = useMemo(() => scenes.filter((scene) => Boolean(scene.customization?.customized)).length, [scenes]);
  const aiGeneratedCount = useMemo(() => scenes.filter((scene) => scene.customization?.sceneVisualPlan?.aiStatus === "generated").length, [scenes]);
  const aiPendingCount = Math.max(0, scenes.length - aiGeneratedCount);

  const activeSceneStep = useMemo(() => {
    if (!scenes.length) return null;
    const scene = scenes[activeStep] || scenes[0];
    return sceneToStep(scene, selectedAssetByScene[scene.id] ?? 0);
  }, [activeStep, scenes, selectedAssetByScene]);

  if (projectLoading) {
    return (
      <div className="hx-page">
        <Header right={<Link to="/signals" className="btn btn-ghost"><IconArrowLeft className="btn-icon" /> Signals</Link>} />
        <div className="container hx-notfound">
          <p>Loading your reel project…</p>
        </div>
      </div>
    );
  }

  if (!realProject) {
    return (
      <div className="hx-page">
        <Header right={<Link to="/signals" className="btn btn-ghost"><IconArrowLeft className="btn-icon" /> Signals</Link>} />
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
        <Header right={<Link to="/signals" className="btn btn-ghost"><IconArrowLeft className="btn-icon" /> Signals</Link>} />
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
                  {project?.research?.sources?.websiteMarketing && <div className="storyboard-brand-visual-action">
                    <div className="storyboard-brand-visual-action__summary">
                      <strong>{aiGeneratedCount} of {scenes.length} scenes have verified Gemini AI images</strong>
                      <span>{aiPendingCount
                        ? "The colored layouts you see are local FFmpeg starter placeholders, NOT Gemini artwork. Replace them with scene-specific AI illustrations before the final video."
                        : "All scene backgrounds were generated with Gemini and validated. Captions are rendered separately."}</span>
                    </div>
                    {aiImageStatus.enabled && <button type="button" className="btn btn-cream"
                      onClick={() => void generateAiImagesForScenes()}
                      disabled={brandVisualLoading || Boolean(aiVisualProgress) || sceneLoading || renderLoading || !aiPendingCount}>
                      {aiVisualProgress
                        ? "Generating AI imagery " + aiVisualProgress.done + "/" + aiVisualProgress.total + "…"
                        : aiPendingCount ? "Generate AI visuals for all scenes (" + aiPendingCount + " remaining)" : "All AI visuals ready"}
                    </button>}
                    {!aiImageStatus.enabled && <span className="storyboard-brand-visual-action__disabled" role="status">
                      Gemini AI images are disabled or not configured on this server. An operator must enable VOXORA_MARKETING_AI_IMAGES_ENABLED and configure the image-model API key.
                    </span>}
                    <button type="button" className="btn btn-ghost" onClick={() => void regenerateAllWebsiteVisuals()}
                      disabled={brandVisualLoading || Boolean(aiVisualProgress) || sceneLoading || renderLoading || !scenes.length}>
                      {brandVisualLoading ? "Building local layouts…" : "Replace all stock with branded visuals (local only)"}
                    </button>
                    <small>{aiImageStatus.enabled
                      ? "Gemini model: " + (aiImageStatus.model || "configured provider") + ". AI requests may be billable. Existing successful AI scenes are skipped. Local refresh does not call Gemini. Brand labels and narration captions remain separate."
                      : "Existing layouts are free, local placeholders. Enabling Gemini is a server-side configuration change; the key is never sent to the browser."}</small>
                    {aiVisualNotice && <p role="status" className="storyboard-brand-visual-action__notice">{aiVisualNotice}</p>}
                  </div>}
                </div>
                <div className="storyboard-editor-intro__stats" aria-label="Storyboard summary">
                  <span><strong>{scenes.length}</strong><small>Scenes</small></span>
                  <span><strong>{narratedSceneCount}</strong><small>Narrated</small></span>
                  <span><strong>{scenes.reduce((total, scene) => total + (scene.assets?.length || 0), 0)}</strong><small>Visuals</small></span>
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
                <div className="hx-hookbox"><IconInfo className="hx-hookbox__icon" /><p><span className="mono-label">HOOK</span> {scenes[0]?.spokenText || "Voxora is building the first scene…"}</p></div>
                {sceneError && <div className="storyboard-error"><strong>Storyboard couldn't load.</strong><span>{sceneError}</span><button className="btn btn-ghost" onClick={() => setSceneRetry((value) => value + 1)}>Retry</button></div>}
                {voiceError && <div className="storyboard-error"><strong>Narration couldn't be generated.</strong><span>{voiceError}</span></div>}
                {sceneEditError && <div className="storyboard-error storyboard-error--scene"><strong>Scene update couldn't be applied.</strong><span>{sceneEditError}</span></div>}
                {sceneLoading && <div className="storyboard-loading"><span className="eyebrow">Generating storyboard</span><strong>{project?.research?.sources?.websiteMarketing ? "Voxora is building website-branded artwork for each scene and preparing narration…" : "Voxora is writing the scenes, fetching five visuals per cut, and generating narration with your selected voice…"}</strong></div>}
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
                        onChangeSceneVoice={(voice, narration) => changeSceneVoice(scene.id, voice, narration)}
                        onRegenerateVisuals={(query) => regenerateSceneVisuals(scene.id, query)}
                        onRegenerateAiVisuals={() => confirmAiSceneImage(scene.id)}
                        aiImagesEnabled={aiImageStatus.enabled}
                        isWebsiteMarketing={Boolean(project?.research?.sources?.websiteMarketing)}
                        sceneBusy={sceneActionFor(scene.id)}
                      />)}
                    </div>
                    <div className="storyboard-narration-status">
                      <span className="eyebrow">Narration</span>
                      <strong>{narrationSummary?.ready ? "Narration ready" : narrationSummary ? `Narration pending · ${narrationSummary.readyScenes}/${narrationSummary.totalScenes} scenes ready` : "Checking narration availability"}</strong>
                      <span>{narrationSummary?.ready
                        ? "Every scene has an audio file ready for the final video. Word timing metadata is optional."
                        : narrationSummary
                          ? `Missing narration for scene${missingNarrationOrders.length === 1 ? "" : "s"} ${missingNarrationOrders.join(", ")}. Continue to Preview to repair only missing audio.`
                          : "Voxora is verifying the narration files before rendering."}</span>
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
            <>
            {project?.research?.sources?.websiteMarketing && aiPendingCount > 0 && <div
              className="storyboard-brand-visual-action storyboard-brand-visual-action--preview" role="status">
              <div className="storyboard-brand-visual-action__summary">
                <strong>{aiPendingCount} scene(s) still use local placeholders instead of Gemini imagery</strong>
                <span>You can render with these layouts, but they are not AI-generated marketing illustrations. Return to the storyboard to request real Gemini backgrounds.</span>
              </div>
              <button type="button" className="btn btn-cream" onClick={() => changeTab("Storyboard")}>
                Go to storyboard to generate AI imagery
              </button>
            </div>}
            <RenderQuota quota={quota} quotaError={quotaError} loading={quotaLoading} refresh={refreshQuota} limitReached={quotaBlocked} />
            <FinalizePanel
              projectId={id}
              project={project}
              scenes={scenes}
              renderStatus={renderStatus}
              renderLoading={renderLoading}
              renderError={renderError}
              onRender={renderProject}
              onNarrationUpdated={(updatedScenes) => {
                setScenes(updatedScenes);
                setNarrationSummary(null);
                setProject((current) => current ? {
                  ...current,
                  durationSeconds: updatedScenes.reduce((total, scene) => total + Number(scene.durationSeconds || 0), 0),
                  cuts: updatedScenes.length,
                  renderUrl: null,
                } : current);
              }}
              onBack={() => changeTab("Storyboard")}
            />
            </>
          )}
        </main>
      </div>
    );
  }
}
