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
  onRewrite,
  onRegenerateVisuals,
  onClose,
  busy = "",
}) {
  const saved = scene.customization && typeof scene.customization === "object" ? scene.customization : {};
  const activeVoice = useMemo(() => getSceneVoice(scene, customSetup, voices), [scene, customSetup, voices]);

  const [framework, setFramework] = useState(saved.framework || customSetup?.framework || "how-it-works");
  const [tone, setTone] = useState(saved.tone || customSetup?.tone || "Conversational");
  const [audience, setAudience] = useState(saved.audienceLevel || customSetup?.audienceLevel || "General public");
  const [narration, setNarration] = useState(scene.spokenText || "");
  const [selectedVoiceKey, setSelectedVoiceKey] = useState("");
  const [playingNarration, setPlayingNarration] = useState(false);

  const narrationAudioRef = useRef(null);

  const selectedVoice = voices.find((voice) => voiceKey(voice) === selectedVoiceKey) || activeVoice;

  useEffect(() => {
    setFramework(saved.framework || customSetup?.framework || "how-it-works");
    setTone(saved.tone || customSetup?.tone || "Conversational");
    setAudience(saved.audienceLevel || customSetup?.audienceLevel || "General public");
    setNarration(scene.spokenText || "");
    setSelectedVoiceKey(voiceKey(getSceneVoice(scene, customSetup, voices)));
    narrationAudioRef.current?.pause();
    narrationAudioRef.current = null;
    setPlayingNarration(false);
  }, [
    scene.id,
    scene.spokenText,
    saved.framework,
    saved.tone,
    saved.audienceLevel,
    activeVoice,
    voices,
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
    const result = await onRewrite?.({
      framework,
      tone,
      audienceLevel: audience,
      targetDurationSeconds: Number(scene.durationSeconds || 5),
      currentNarration: narration.trim(),
      instruction: "",
      refreshVisuals: true,
      voice: selectedVoice ? { source: selectedVoice.source, id: selectedVoice.id } : null,
    });
    if (result?.scene?.spokenText) setNarration(result.scene.spokenText);
  }

  async function refreshSceneVisuals() {
    const query = narration.trim().replace(/\s+/g, " ").slice(0, 120);
    await onRegenerateVisuals?.(query);
  }

  function selectSceneVoice(voice) {
    if (voice) setSelectedVoiceKey(voiceKey(voice));
  }

  function toggleNarrationPlayback() {
    if (!scene.audioUrl) return;
    if (playingNarration) {
      narrationAudioRef.current?.pause();
      narrationAudioRef.current = null;
      setPlayingNarration(false);
      return;
    }
    narrationAudioRef.current?.pause();
    const separator = scene.audioUrl.includes("?") ? "&" : "?";
    const audio = new Audio(scene.audioUrl + separator + "v=" + Date.now());
    narrationAudioRef.current = audio;
    audio.onended = () => {
      if (narrationAudioRef.current === audio) {
        narrationAudioRef.current = null;
        setPlayingNarration(false);
      }
    };
    audio.onerror = () => {
      if (narrationAudioRef.current === audio) {
        narrationAudioRef.current = null;
        setPlayingNarration(false);
      }
    };
    setPlayingNarration(true);
    void audio.play().catch(() => setPlayingNarration(false));
  }

  useEffect(() => () => {
    narrationAudioRef.current?.pause();
    narrationAudioRef.current = null;
  }, [scene.id]);

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

        <div className="scene-customize__settings">
          <div className="scene-customize__fields scene-customize__fields--four">
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
              <span>Project Voice</span>
              <select
                value={selectedVoiceKey}
                onChange={(event) => selectSceneVoice(voices.find((voice) => voiceKey(voice) === event.target.value))}
                disabled={Boolean(busy) || !voices.length}
              >
                {!voices.length && <option value="">Loading voices…</option>}
                {voices.map((voice) => (
                  <option key={voiceKey(voice)} value={voiceKey(voice)}>
                    {voice.source === "clone" ? "Your clone · " : "Preset · "}{voice.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

        </div>

        <div className="scene-customize__section">
          <div className="scene-customize__section-head">
            <div>
              <span className="mono-label">NARRATION</span>
              <strong>Write the line you want the scene to say</strong>
            </div>
            <div className="scene-customize__section-actions">
              {scene.audioUrl && (
                <button
                  type="button"
                  className="scene-customize__preview"
                  onClick={toggleNarrationPlayback}
                  disabled={Boolean(busy)}
                >
                  {playingNarration ? "Stop" : "Play"}
                </button>
              )}
              <button
                type="button"
                className="scene-customize__ai"
                onClick={regenerateNarration}
                disabled={Boolean(busy) || !narration.trim()}
                title="Regenerate this scene from the research and current draft"
              >
                {busy === "rewrite" || busy === "rewrite-visuals" ? "Regenerating…" : "Regenerate"}
              </button>
            </div>
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
            AI rebuilds the scene from the persisted research and the other scenes. It does not simply swap words.
          </div>
        </div>

        <div className="scene-customize__section scene-customize__visuals">
          <div className="scene-customize__section-head">
            <div>
              <span className="mono-label">VISUALS</span>
              <strong>Regenerate visuals from the current narration</strong>
            </div>
            <button
              type="button"
              className="scene-customize__refresh"
              onClick={() => void refreshSceneVisuals()}
              disabled={Boolean(busy)}
            >
              {busy === "visuals" ? "Regenerating…" : "Regenerate Visuals"}
            </button>
          </div>

          <div className="scene-customize__visual-group">
            <span className="scene-customize__visual-label">CURRENT</span>
            <div className="scene-customize__visual-strip">
              {(Array.isArray(scene.assets) ? scene.assets.slice(0, 5) : []).map((asset, index) => (
                <div className="scene-customize__visual-card" key={asset.id || "current-" + index}>
                  <img src={asset.thumbnailUrl} alt={"Current visual " + (index + 1)} />
                  <span>{index + 1}</span>
                </div>
              ))}
              {!scene.assets?.length && <div className="scene-customize__visual-empty">No visuals available.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(modal, document.body);
}
