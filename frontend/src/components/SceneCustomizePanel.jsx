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

function ModernDropdown({ label, value, options, onChange, voice = false, disabled = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={"scene-customize__dropdown " + (open ? "is-open" : "")} ref={rootRef}>
      <span className="scene-customize__dropdown-label">{label}</span>
      <button
        type="button"
        className="scene-customize__dropdown-trigger"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="scene-customize__dropdown-trigger-copy">
          <strong>{selected?.label || "Choose"}</strong>
          {selected?.meta && <small>{selected.meta}</small>}
        </span>
        <span className="scene-customize__dropdown-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className={"scene-customize__dropdown-menu " + (voice ? "is-voice" : "")} role="listbox">
          {options.map((option) => (
            <button
              type="button"
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={"scene-customize__dropdown-option " + (option.value === value ? "is-selected" : "")}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span className="scene-customize__dropdown-option-main">
                <strong>{option.label}</strong>
                {option.meta && <small>{option.meta}</small>}
                {voice && option.details && <span className="scene-customize__dropdown-option-details">{option.details}</span>}
              </span>
              {option.value === value && <span className="scene-customize__dropdown-check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
  selectedAssetIndex = 0,
  customSetup,
  voices = [],
  onRewrite,
  onChangeVoice,
  onSelectAsset,
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
  const [selectedVoiceKey, setSelectedVoiceKey] = useState(() => voiceKey(activeVoice));
  const [playingNarration, setPlayingNarration] = useState(false);
  const [voiceGenerating, setVoiceGenerating] = useState(false);
  const [selectedVisualIndex, setSelectedVisualIndex] = useState(selectedAssetIndex);

  const narrationAudioRef = useRef(null);

  const selectedVoice = voices.find((voice) => voiceKey(voice) === selectedVoiceKey) || activeVoice;
  const voiceChanged = selectedVoiceKey !== voiceKey(activeVoice);

  useEffect(() => {
    setFramework(saved.framework || customSetup?.framework || "how-it-works");
    setTone(saved.tone || customSetup?.tone || "Conversational");
    setAudience(saved.audienceLevel || customSetup?.audienceLevel || "General public");
    setNarration(scene.spokenText || "");
    setSelectedVoiceKey(voiceKey(getSceneVoice(scene, customSetup, voices)));
    setSelectedVisualIndex(selectedAssetIndex);
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
    selectedAssetIndex,
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
    if (result?.scene?.audioUrl) await playAudioUrl(result.scene.audioUrl);
  }

  async function refreshSceneVisuals() {
    const query = narration.trim().replace(/\s+/g, " ").slice(0, 120);
    await onRegenerateVisuals?.(query);
  }

  function selectSceneVoice(voice) {
    if (voice) setSelectedVoiceKey(voiceKey(voice));
  }

  async function playAudioUrl(audioUrl) {
    if (!audioUrl) return;
    narrationAudioRef.current?.pause();
    const separator = audioUrl.includes("?") ? "&" : "?";
    const audio = new Audio(audioUrl + separator + "v=" + Date.now());
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
    try {
      await audio.play();
    } catch {
      if (narrationAudioRef.current === audio) {
        narrationAudioRef.current = null;
        setPlayingNarration(false);
      }
    }
  }

  async function toggleNarrationPlayback() {
    if (playingNarration) {
      narrationAudioRef.current?.pause();
      narrationAudioRef.current = null;
      setPlayingNarration(false);
      return;
    }

    if (voiceChanged) {
      if (!selectedVoice || !narration.trim()) return;
      setVoiceGenerating(true);
      try {
        const result = await onChangeVoice?.(selectedVoice, narration);
        if (result?.scene?.audioUrl) {
          if (result.scene.spokenText) setNarration(result.scene.spokenText);
          await playAudioUrl(result.scene.audioUrl);
        }
      } finally {
        setVoiceGenerating(false);
      }
      return;
    }

    await playAudioUrl(scene.audioUrl);
  }

  function selectVisual(index) {
    setSelectedVisualIndex(index);
    onSelectAsset?.(index);
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
            <ModernDropdown
              label="Framework"
              value={framework}
              onChange={setFramework}
              options={FRAMEWORKS.map((item) => ({ value: item.key, label: item.label }))}
              disabled={Boolean(busy)}
            />
            <ModernDropdown
              label="Tone"
              value={tone}
              onChange={setTone}
              options={TONES.map((item) => ({ value: item, label: item }))}
              disabled={Boolean(busy)}
            />
            <ModernDropdown
              label="Audience"
              value={audience}
              onChange={setAudience}
              options={AUDIENCES.map((item) => ({ value: item, label: item }))}
              disabled={Boolean(busy)}
            />
            <ModernDropdown
              label="Project Voice"
              value={selectedVoiceKey}
              onChange={(value) => selectSceneVoice(voices.find((voice) => voiceKey(voice) === value))}
              voice
              options={voices.map((voice) => ({
                value: voiceKey(voice),
                label: (voice.source === "clone" ? "Your clone · " : "Preset · ") + voice.name,
                meta: [voice.engine, voice.language, voice.gender].filter(Boolean).join(" · "),
                details: [voice.accent, voice.tone, voice.description].filter(Boolean).join(" · "),
              }))}
              disabled={Boolean(busy) || !voices.length}
            />
          </div>

        </div>

        <div className="scene-customize__section">
          <div className="scene-customize__section-head scene-customize__narration-head">
            <div>
              <span className="mono-label">NARRATION</span>
              <strong>Write the line you want the scene to say</strong>
            </div>
            <div className="scene-customize__section-actions">
              <button
                type="button"
                className="scene-customize__preview"
                onClick={toggleNarrationPlayback}
                disabled={Boolean(busy) || (!voiceChanged && !scene.audioUrl)}
              >
                {voiceGenerating || busy === "voice" ? "Generating…" : playingNarration ? "Stop" : voiceChanged ? "Preview Voice" : "Play Narration"}
              </button>
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
            <span className="scene-customize__visual-label">VISUALS · SELECT ONE</span>
            <div className="scene-customize__visual-strip">
              {(Array.isArray(scene.assets) ? scene.assets.slice(0, 5) : []).map((asset, index) => (
                <button
                  type="button"
                  className={"scene-customize__visual-card " + (selectedVisualIndex === index ? "is-selected" : "")}
                  key={asset.id || "current-" + index}
                  onClick={() => selectVisual(index)}
                  aria-label={"Use visual option " + (index + 1)}
                  aria-pressed={selectedVisualIndex === index}
                >
                  <img src={asset.thumbnailUrl} alt={"Visual option " + (index + 1)} />
                  {selectedVisualIndex === index && <span className="scene-customize__visual-selected">✓</span>}
                  <span className="scene-customize__visual-number">{index + 1}</span>
                </button>
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
