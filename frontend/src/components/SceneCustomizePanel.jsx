import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./SceneCustomizePanel.css";

const FRAMEWORKS = [
  { key: "disruptor", label: "The Disruptor" },
  { key: "how-it-works", label: "How It Works" },
  { key: "skeptic", label: "The Skeptic" },
  { key: "countdown", label: "The Countdown" },
];
const TONES = ["Energetic", "Calm & authoritative", "Conversational"];
const AUDIENCES = ["General public", "Enthusiast"];

function voiceKey(voice) {
  return voice ? voice.source + ":" + voice.id : "";
}

function getSceneVoice(scene, setup, voices) {
  const saved = scene.customization?.voice;
  if (saved?.id) {
    return voices.find((voice) => voice.source === saved.source && voice.id === saved.id) || {
      source: saved.source,
      id: saved.id,
      name: saved.name || "Selected voice",
      engine: saved.engine || "",
      language: saved.language || "English",
      accent: "",
      gender: "",
      tone: "",
      description: saved.source === "clone" ? "Your cloned voice" : "Predefined voice",
    };
  }

  return voices.find((voice) => voice.source === setup?.voice?.source && voice.id === setup?.voice?.id) || null;
}

export default function SceneCustomizePanel({
  scene,
  customSetup,
  voices = [],
  onPreviewVoice,
  previewingVoice = "",
  previewLoading = "",
  onRewrite,
  onChangeVoice,
  onRegenerateVisuals,
  onClose,
  busy = "",
}) {
  const saved = scene.customization && typeof scene.customization === "object" ? scene.customization : {};
  const activeVoice = useMemo(() => getSceneVoice(scene, customSetup, voices), [scene, customSetup, voices]);

  const [framework, setFramework] = useState(saved.framework || customSetup?.framework || "how-it-works");
  const [tone, setTone] = useState(saved.tone || customSetup?.tone || "Conversational");
  const [audience, setAudience] = useState(saved.audienceLevel || customSetup?.audienceLevel || "General public");
  const [lengthMode, setLengthMode] = useState("keep");
  const [narration, setNarration] = useState(scene.spokenText || "");
  const [refreshVisuals, setRefreshVisuals] = useState(true);
  const [visualQuery, setVisualQuery] = useState(scene.brollSearchTerm || "");

  const voiceRef = useRef(null);
  const currentDuration = Number(scene.durationSeconds || 5);
  const targetDuration = useMemo(() => {
    if (lengthMode === "shorter") return Math.max(1.5, Math.min(30, currentDuration * 0.78));
    if (lengthMode === "longer") return Math.max(1.5, Math.min(30, currentDuration * 1.22));
    return currentDuration;
  }, [currentDuration, lengthMode]);

  const selectedVoiceKey = voiceKey(activeVoice);
  const selectedVoice = voices.find((voice) => voiceKey(voice) === selectedVoiceKey) || activeVoice;
  const projectFramework = FRAMEWORKS.find((item) => item.key === (customSetup?.framework || "how-it-works"))?.label || "How It Works";

  useEffect(() => {
    setFramework(saved.framework || customSetup?.framework || "how-it-works");
    setTone(saved.tone || customSetup?.tone || "Conversational");
    setAudience(saved.audienceLevel || customSetup?.audienceLevel || "General public");
    setNarration(scene.spokenText || "");
    setVisualQuery(scene.brollSearchTerm || "");
    setLengthMode("keep");
  }, [
    scene.id,
    scene.spokenText,
    scene.brollSearchTerm,
    saved.framework,
    saved.tone,
    saved.audienceLevel,
    customSetup?.framework,
    customSetup?.tone,
    customSetup?.audienceLevel,
  ]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  async function regenerateNarration() {
    const ok = await onRewrite?.({
      framework,
      tone,
      audienceLevel: audience,
      targetDurationSeconds: Number(targetDuration.toFixed(1)),
      currentNarration: narration.trim(),
      instruction: "",
      refreshVisuals,
    });
    if (ok) setLengthMode("keep");
  }

  async function applyVoice(voice) {
    if (!voice || voiceKey(voice) === selectedVoiceKey) return;
    await onChangeVoice?.(voice);
  }

  const modal = (
    <div
      className="scene-customize-modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="scene-customize scene-customize--modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={"scene-customize-title-" + scene.id}
      >
        <div className="scene-customize__modal-head">
          <div>
            <span className="mono-label">SCENE {String(scene.sceneOrder).padStart(2, "0")} · EDITOR</span>
            <h2 id={"scene-customize-title-" + scene.id}>Customize this scene</h2>
            <p>Changes here affect only this scene. Research stays fixed and the AI rebuilds the narration from that evidence.</p>
          </div>
          <button
            type="button"
            className="scene-customize__close"
            onClick={() => onClose?.()}
            aria-label="Close scene customization"
          >
            ×
          </button>
        </div>

        <div className="scene-customize__context">
          <div>
            <span className="mono-label">INHERITED SETUP</span>
            <strong>{projectFramework}</strong>
          </div>
          <div>
            <span>Project tone</span>
            <strong>{customSetup?.tone || "Conversational"}</strong>
          </div>
          <div>
            <span>Audience</span>
            <strong>{customSetup?.audienceLevel || "General public"}</strong>
          </div>
          <div>
            <span>Project voice</span>
            <strong>{customSetup?.voice?.name || "Project voice"}</strong>
          </div>
        </div>

        <div className="scene-customize__section">
          <div className="scene-customize__section-head">
            <div>
              <span className="mono-label">NARRATION</span>
              <strong>Write the line you want the scene to say</strong>
            </div>
            <button
              type="button"
              className="scene-customize__ai"
              onClick={regenerateNarration}
              disabled={Boolean(busy) || !narration.trim()}
              title="Regenerate this scene from the research and current draft"
            >
              {busy === "rewrite" || busy === "rewrite-visuals" ? "✦ Regenerating…" : "✦ AI regenerate"}
            </button>
          </div>

          <textarea
            className="scene-customize__narration"
            value={narration}
            onChange={(event) => setNarration(event.target.value)}
            placeholder="Your current narration appears here…"
            rows={6}
            disabled={Boolean(busy)}
          />

          <div className="scene-customize__hint">
            <span>AI does not simply swap words.</span>
            <span>It uses the persisted research and the other scenes to create a distinct, evidence-grounded angle.</span>
          </div>

          <label className="scene-customize__check">
            <input
              type="checkbox"
              checked={refreshVisuals}
              onChange={(event) => setRefreshVisuals(event.target.checked)}
              disabled={Boolean(busy)}
            />
            <span>After AI regeneration, refresh the five Pexels visuals from the new narration</span>
          </label>
        </div>

        <div className="scene-customize__grid">
          <div className="scene-customize__section">
            <div className="scene-customize__section-head">
              <div>
                <span className="mono-label">STYLE</span>
                <strong>Scene-level settings</strong>
              </div>
            </div>

            <div className="scene-customize__fields">
              <label>
                <span>Framework</span>
                <select value={framework} onChange={(event) => setFramework(event.target.value)} disabled={Boolean(busy)}>
                  {FRAMEWORKS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                </select>
              </label>

              <label>
                <span>Tone</span>
                <select value={tone} onChange={(event) => setTone(event.target.value)} disabled={Boolean(busy)}>
                  {TONES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>

              <label>
                <span>Audience</span>
                <select value={audience} onChange={(event) => setAudience(event.target.value)} disabled={Boolean(busy)}>
                  {AUDIENCES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>

              <label>
                <span>Line length</span>
                <select value={lengthMode} onChange={(event) => setLengthMode(event.target.value)} disabled={Boolean(busy)}>
                  <option value="keep">Keep current</option>
                  <option value="shorter">Tighter (~22% shorter)</option>
                  <option value="longer">More room (~22% longer)</option>
                </select>
              </label>
            </div>
          </div>

          <div className="scene-customize__section">
            <div className="scene-customize__section-head">
              <div>
                <span className="mono-label">VOICE</span>
                <strong>Scene narrator</strong>
              </div>
              {selectedVoice && (
                <button
                  type="button"
                  className="scene-customize__preview"
                  onClick={() => onPreviewVoice?.(selectedVoice)}
                  disabled={Boolean(busy)}
                >
                  {previewLoading === selectedVoiceKey ? "Loading…" : previewingVoice === selectedVoiceKey ? "Stop" : "Preview"}
                </button>
              )}
            </div>

            <div ref={voiceRef}>
              <select
                className="scene-customize__voice-select"
                value={selectedVoiceKey}
                onChange={(event) => {
                  const next = voices.find((voice) => voiceKey(voice) === event.target.value);
                  if (next) void applyVoice(next);
                }}
                disabled={Boolean(busy) || !voices.length}
                aria-label="Scene narrator"
              >
                {!voices.length && <option value="">Loading voices…</option>}
                {voices.map((voice) => (
                  <option key={voiceKey(voice)} value={voiceKey(voice)}>
                    {voice.source === "clone" ? "Your clone · " : "Preset · "}{voice.name}
                  </option>
                ))}
              </select>
            </div>

            <small className="scene-customize__meta">
              {selectedVoice?.engine || "Project voice"}{selectedVoice?.language ? " · " + selectedVoice.language : ""}
            </small>
          </div>
        </div>

        <div className="scene-customize__section scene-customize__visuals">
          <div className="scene-customize__section-head">
            <div>
              <span className="mono-label">VISUALS</span>
              <strong>Refresh the five Pexels options for this scene</strong>
            </div>
            <button
              type="button"
              className="scene-customize__refresh"
              onClick={() => onRegenerateVisuals?.(visualQuery)}
              disabled={Boolean(busy) || !visualQuery.trim()}
            >
              {busy === "visuals" ? "Refreshing…" : "Refresh 5 visuals"}
            </button>
          </div>
          <input
            className="scene-customize__visual-query"
            value={visualQuery}
            onChange={(event) => setVisualQuery(event.target.value)}
            placeholder="Visual search phrase"
            disabled={Boolean(busy)}
          />
          <small className="scene-customize__meta">The AI refresh option above replaces this phrase automatically from the regenerated narration.</small>
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(modal, document.body);
}
