import { useEffect, useMemo, useRef, useState } from "react";

const LABELS = {
  disruptor: "The Disruptor",
  "how-it-works": "How It Works",
  skeptic: "The Skeptic",
  countdown: "The Countdown",
};

function ChoiceRow({ title, reasoning, options, value, onChange, renderOption = (option) => option }) {
  return (
    <section className="setup-choice">
      <div className="setup-choice__copy">
        <h3>{title}</h3>
        <p>{reasoning}</p>
      </div>
      <div className="setup-pills" role="radiogroup" aria-label={title}>
        {options.map((option) => {
          const key = typeof option === "object" ? option.key : option;
          const selected = value === key;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              className={"setup-pill " + (selected ? "is-selected" : "")}
              key={key}
              onClick={() => onChange(key)}
            >
              {renderOption(option)}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PreviewButton({ previewKey, previewingVoice, previewLoading, onPreview }) {
  const active = previewingVoice === previewKey;
  const loading = previewLoading === previewKey;
  return (
    <button
      type="button"
      className={"setup-voice-preview " + (active ? "is-playing" : "")}
      onClick={(event) => {
        event.stopPropagation();
        onPreview(previewKey);
      }}
      aria-label={active ? "Stop voice preview" : "Preview voice"}
    >
      {loading ? "Loading…" : active ? "Stop" : "Preview"}
    </button>
  );
}

function voiceSearchText(voice) {
  return [
    voice.name,
    voice.accent,
    voice.gender,
    voice.tone,
    voice.description,
    voice.language,
    voice.engine,
  ].filter(Boolean).join(" ").toLowerCase();
}

export default function SetupPanel({ projectId, onComplete }) {
  const [suggestions, setSuggestions] = useState(null);
  const [voiceProfiles, setVoiceProfiles] = useState([]);
  const [predefinedVoices, setPredefinedVoices] = useState([]);
  const [choices, setChoices] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState("");
  const [previewLoading, setPreviewLoading] = useState("");
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const [voiceSearch, setVoiceSearch] = useState("");
  const previewAudioRef = useRef(null);
  const previewRequestRef = useRef(null);
  const voicePickerRef = useRef(null);
  const voiceSearchRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [suggestionsResponse, profilesResponse, presetsResponse] = await Promise.all([
          fetch(`/api/projects/${projectId}/setup/suggestions`),
          fetch("/api/voice-profiles"),
          fetch("/api/voice-presets"),
        ]);
        const data = await suggestionsResponse.json().catch(() => ({}));
        const profilesData = await profilesResponse.json().catch(() => ({}));
        const presetsData = await presetsResponse.json().catch(() => ({}));

        if (!suggestionsResponse.ok) throw new Error(data.error || "Failed to load setup suggestions.");
        if (!profilesResponse.ok) throw new Error(profilesData.error || "Failed to load voice profiles.");
        if (!presetsResponse.ok) throw new Error(presetsData.error || "Failed to load predefined voices.");
        if (cancelled) return;

        const readyProfiles = Array.isArray(profilesData.profiles)
          ? profilesData.profiles.filter((profile) => profile.status === "ready" && profile.ttsVoiceId)
          : [];
        const presets = Array.isArray(presetsData.voices) ? presetsData.voices : [];

        setSuggestions(data.suggestions);
        setVoiceProfiles(readyProfiles);
        setPredefinedVoices(presets);

        const savedProfileId = data.voiceProfileId || "";
        const savedPresetId = data.voicePresetId || "";
        const defaultProfileId = readyProfiles[0]?.id || "";
        const defaultPresetId = presets[0]?.id || "";
        setChoices({
          length: data.suggestions.length.value,
          framework: data.suggestions.framework.value,
          tone: data.suggestions.tone.value,
          audienceLevel: data.suggestions.audience.value,
          voiceProfileId: savedProfileId || (!savedPresetId && defaultProfileId ? defaultProfileId : ""),
          voicePresetId: savedPresetId || (!savedProfileId && !defaultProfileId ? defaultPresetId : ""),
        });
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load setup suggestions.");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    function handleOutside(event) {
      if (!voicePickerRef.current?.contains(event.target)) {
        setVoicePickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    if (!voicePickerOpen) return;
    const timer = window.setTimeout(() => voiceSearchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [voicePickerOpen]);

  useEffect(() => () => {
    previewRequestRef.current?.abort();
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
  }, []);

  const allVoiceOptions = useMemo(() => [
    ...voiceProfiles.map((profile) => ({
      source: "clone",
      id: profile.id,
      name: profile.name,
      language: profile.language || "English",
      engine: profile.preferredEngine === "qwen3-tts-0.6b" ? "Qwen3-TTS 0.6B" : "Chatterbox-Nano",
      description: "Your cloned voice profile",
      accent: "",
      gender: "",
      tone: "",
      profile,
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
      preset: voice,
    })),
  ], [voiceProfiles, predefinedVoices]);

  const selectedVoice = useMemo(() => {
    if (!choices) return null;
    return allVoiceOptions.find((voice) => (
      voice.source === "clone"
        ? voice.id === choices.voiceProfileId
        : voice.id === choices.voicePresetId
    )) || null;
  }, [allVoiceOptions, choices]);

  const filteredVoiceOptions = useMemo(() => {
    const query = voiceSearch.trim().toLowerCase();
    if (!query) return allVoiceOptions;
    return allVoiceOptions.filter((voice) => voiceSearchText(voice).includes(query));
  }, [allVoiceOptions, voiceSearch]);

  const filteredClones = filteredVoiceOptions.filter((voice) => voice.source === "clone");
  const filteredPresets = filteredVoiceOptions.filter((voice) => voice.source === "preset");

  function stopPreview() {
    previewRequestRef.current?.abort();
    previewRequestRef.current = null;
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
    setPreviewingVoice("");
    setPreviewLoading("");
  }

  async function previewVoice(voiceOption) {
    const previewKey = voiceOption.source + ":" + voiceOption.id;
    if (previewingVoice === previewKey || previewLoading === previewKey) {
      stopPreview();
      return;
    }

    stopPreview();
    setPreviewLoading(previewKey);
    setError("");
    const controller = new AbortController();
    previewRequestRef.current = controller;

    try {
      const endpoint = voiceOption.source === "clone"
        ? `/api/voice-profiles/${encodeURIComponent(voiceOption.id)}/preview`
        : `/api/voice-presets/${encodeURIComponent(voiceOption.id)}/preview`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to preview this voice.");

      const audio = new Audio(`data:${data.mimeType || "audio/wav"};base64,${data.audioBase64}`);
      previewAudioRef.current = audio;
      audio.onended = () => {
        if (previewAudioRef.current === audio) {
          previewAudioRef.current = null;
          setPreviewingVoice("");
        }
      };
      audio.onerror = () => {
        if (previewAudioRef.current === audio) {
          previewAudioRef.current = null;
          setPreviewingVoice("");
          setError("This voice preview could not be played.");
        }
      };

      await audio.play();
      if (previewRequestRef.current !== controller) {
        audio.pause();
        return;
      }

      previewRequestRef.current = null;
      setPreviewLoading("");
      setPreviewingVoice(previewKey);
    } catch (err) {
      if (err?.name !== "AbortError") {
        setPreviewLoading("");
        setPreviewingVoice("");
        setError(err.message || "Failed to preview this voice.");
      }
    }
  }

  function selectVoice(voice) {
    stopPreview();
    setChoices((current) => ({
      ...current,
      voiceProfileId: voice.source === "clone" ? voice.id : "",
      voicePresetId: voice.source === "preset" ? voice.id : "",
    }));
    setVoicePickerOpen(false);
    setVoiceSearch("");
  }

  async function save() {
    if (!choices) return;
    setSaving(true);
    setError("");
    stopPreview();

    try {
      if (!choices.voiceProfileId && !choices.voicePresetId) {
        throw new Error("Select a narration voice before continuing to the storyboard.");
      }
      if (choices.voiceProfileId && choices.voicePresetId) {
        throw new Error("Choose either a cloned voice or a predefined voice, not both.");
      }

      const response = await fetch(`/api/projects/${projectId}/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(choices),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to save setup.");
      onComplete?.(data.project);
    } catch (err) {
      setError(err.message || "Failed to save setup.");
    } finally {
      setSaving(false);
    }
  }

  if (error && !suggestions) return <div className="setup-error"><strong>Setup couldn't load.</strong><span>{error}</span></div>;
  if (!suggestions || !choices) return <div className="setup-loading">Helix is preparing your best defaults…</div>;

  return (
    <div className="setup-panel">
      <div className="setup-panel__intro">
        <p className="eyebrow">Guided setup</p>
        <h2>Shape the video without changing the research.</h2>
        <p>Helix has already completed the research for this project. Choose how that research should be turned into a short-form story, including the narrator.</p>
      </div>

      <section className="setup-research-bridge" aria-labelledby="setup-research-bridge-title">
        <div className="setup-research-bridge__icon" aria-hidden="true">✓</div>
        <div className="setup-research-bridge__copy">
          <p className="mono-label">RESEARCH FOUNDATION</p>
          <h3 id="setup-research-bridge-title">This setup stays connected to the completed research</h3>
          <p>The storyboard will use the same persisted research corpus for this project. Setup controls presentation — length, narrative framework, tone, audience, and narrator — not the factual foundation.</p>
          <div className="setup-research-bridge__flow" aria-label="Research to storyboard flow">
            <span>Completed research</span>
            <span aria-hidden="true">→</span>
            <strong>Guided setup</strong>
            <span aria-hidden="true">→</span>
            <span>Research-grounded storyboard + narration</span>
          </div>
        </div>
      </section>

      <ChoiceRow title="Script length" reasoning={suggestions.length.reasoning} options={suggestions.length.options} value={choices.length} onChange={(value) => setChoices((current) => ({ ...current, length: value }))} renderOption={(value) => `${value}s`} />
      <ChoiceRow title="Script template" reasoning={suggestions.framework.reasoning} options={suggestions.framework.options} value={choices.framework} onChange={(value) => setChoices((current) => ({ ...current, framework: value }))} renderOption={(option) => LABELS[option.key] || option.label} />
      <ChoiceRow title="Tone" reasoning={suggestions.tone.reasoning} options={suggestions.tone.options} value={choices.tone} onChange={(value) => setChoices((current) => ({ ...current, tone: value }))} />
      <ChoiceRow title="Audience" reasoning={suggestions.audience.reasoning} options={suggestions.audience.options} value={choices.audienceLevel} onChange={(value) => setChoices((current) => ({ ...current, audienceLevel: value }))} />

      <section className="setup-choice setup-choice--voice">
        <div className="setup-choice__copy">
          <h3>Narration voice</h3>
          <p>Choose your own cloned voice or a predefined narrator. Search by name, accent, gender, tone, or style, then preview before continuing.</p>
        </div>

        <div className="setup-voice-picker" ref={voicePickerRef}>
          <button
            type="button"
            className={"setup-voice-trigger " + (voicePickerOpen ? "is-open" : "")}
            aria-haspopup="listbox"
            aria-expanded={voicePickerOpen}
            onClick={() => setVoicePickerOpen((open) => !open)}
          >
            {selectedVoice ? (
              <span className="setup-voice-trigger__selected">
                <span className="setup-voice-trigger__source">{selectedVoice.source === "clone" ? "YOUR CLONE" : "PREDEFINED"}</span>
                <strong>{selectedVoice.name}</strong>
                <span>{[selectedVoice.accent, selectedVoice.gender, selectedVoice.tone, selectedVoice.language].filter(Boolean).join(" · ")}</span>
              </span>
            ) : (
              <span className="setup-voice-trigger__placeholder">Select a narration voice…</span>
            )}
            <span className="setup-voice-trigger__chevron" aria-hidden="true">⌄</span>
          </button>

          {voicePickerOpen && (
            <div className="setup-voice-menu" role="dialog" aria-label="Select narration voice">
              <div className="setup-voice-search">
                <span aria-hidden="true">⌕</span>
                <input
                  ref={voiceSearchRef}
                  type="search"
                  value={voiceSearch}
                  onChange={(event) => setVoiceSearch(event.target.value)}
                  placeholder="Search voices, accents, styles…"
                  aria-label="Search narration voices"
                />
                {voiceSearch && <button type="button" onClick={() => setVoiceSearch("")} aria-label="Clear voice search">×</button>}
              </div>

              <div className="setup-voice-menu__body">
                {filteredClones.length > 0 && (
                  <div className="setup-voice-group">
                    <div className="setup-voice-group__label">YOUR VOICE LIBRARY</div>
                    {filteredClones.map((voice) => {
                      const selected = selectedVoice?.source === "clone" && selectedVoice.id === voice.id;
                      const previewKey = "clone:" + voice.id;
                      return (
                        <div
                          key={previewKey}
                          role="option"
                          aria-selected={selected}
                          className={"setup-voice-option " + (selected ? "is-selected" : "")}
                          onClick={() => selectVoice(voice)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              selectVoice(voice);
                            }
                          }}
                          tabIndex={0}
                        >
                          <span className="setup-voice-option__copy">
                            <strong>{voice.name}</strong>
                            <span>{voice.description} · {voice.engine} · {voice.language}</span>
                          </span>
                          <PreviewButton previewKey={previewKey} previewingVoice={previewingVoice} previewLoading={previewLoading} onPreview={() => previewVoice(voice)} />
                        </div>
                      );
                    })}
                  </div>
                )}

                {filteredPresets.length > 0 && (
                  <div className="setup-voice-group">
                    <div className="setup-voice-group__label">PREDEFINED VOICES</div>
                    {filteredPresets.map((voice) => {
                      const selected = selectedVoice?.source === "preset" && selectedVoice.id === voice.id;
                      const previewKey = "preset:" + voice.id;
                      return (
                        <div
                          key={previewKey}
                          role="option"
                          aria-selected={selected}
                          className={"setup-voice-option " + (selected ? "is-selected" : "")}
                          onClick={() => selectVoice(voice)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              selectVoice(voice);
                            }
                          }}
                          tabIndex={0}
                        >
                          <span className="setup-voice-option__copy">
                            <strong>{voice.name}</strong>
                            <span>{[voice.accent, voice.gender, voice.tone, voice.language].filter(Boolean).join(" · ")}</span>
                            <small>{voice.description}</small>
                          </span>
                          <PreviewButton previewKey={previewKey} previewingVoice={previewingVoice} previewLoading={previewLoading} onPreview={() => previewVoice(voice)} />
                        </div>
                      );
                    })}
                  </div>
                )}

                {!filteredClones.length && !filteredPresets.length && (
                  <div className="setup-voice-search-empty">No voices match “{voiceSearch}”.</div>
                )}
              </div>

              <div className="setup-voice-menu__footer">
                <span>{allVoiceOptions.length} narration voices available</span>
                {!voiceProfiles.length && <a href="/voice-profiles">Create your own cloned voice</a>}
              </div>
            </div>
          )}
        </div>
      </section>

      {suggestions.framework.guardrailApplied && <div className="setup-guardrail"><strong>Monetization guardrail applied.</strong> Helix selected a safer narrative because the research flagged a high-risk issue.</div>}
      {error && <div className="setup-error"><span>{error}</span></div>}
      <div className="setup-actions">
        <button className="btn btn-cream" type="button" disabled={saving} onClick={save}>{saving ? "Saving…" : "Continue to storyboard →"}</button>
      </div>
    </div>
  );
}
