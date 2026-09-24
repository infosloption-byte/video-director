import { useEffect, useMemo, useRef, useState } from "react";

const LABELS = {
  disruptor: "The Disruptor",
  "how-it-works": "How It Works",
  skeptic: "The Skeptic",
  countdown: "The Countdown",
};

function ChoiceRow({ step, title, reasoning, options, value, onChange, renderOption = (option) => option, recommendedValue }) {
  const selectedOption = options.find((option) => (
    (typeof option === "object" ? option.key : option) === value
  ));
  const selectedLabel = selectedOption
    ? renderOption(selectedOption)
    : String(value || "");
  const isRecommended = recommendedValue !== undefined && value === recommendedValue;

  return (
    <section className="setup-choice">
      <div className="setup-choice__copy">
        <div className="setup-choice__eyebrow">
          <span className="setup-choice__step">0{step}</span>
          <span className="mono-label">{step === 1 ? "DURATION" : step === 2 ? "NARRATIVE" : step === 3 ? "DELIVERY" : "REACH"}</span>
        </div>
        <div className="setup-choice__title-row">
          <h3>{title}</h3>
          {isRecommended && <span className="setup-recommendation">Helix pick</span>}
        </div>
        <p>{reasoning}</p>
      </div>
      <div className="setup-choice__control">
        <div className="setup-selected-value">
          <span>Selected</span>
          <strong>{selectedLabel}</strong>
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

function voiceInitials(name) {
  return String(name || "Voice")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function SetupPanel({ projectId, onComplete, onDirtyChange }) {
  const [suggestions, setSuggestions] = useState(null);
  const [voiceProfiles, setVoiceProfiles] = useState([]);
  const [predefinedVoices, setPredefinedVoices] = useState([]);
  const [choices, setChoices] = useState(null);
  const [savedChoices, setSavedChoices] = useState(null);
  const [hasSavedSetup, setHasSavedSetup] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState("");
  const [previewLoading, setPreviewLoading] = useState("");
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const [voicePickerPlacement, setVoicePickerPlacement] = useState("down");
  const [voiceSearch, setVoiceSearch] = useState("");
  const previewAudioRef = useRef(null);
  const previewRequestRef = useRef(null);
  const voicePickerRef = useRef(null);
  const voiceMenuRef = useRef(null);
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

        const persistedSetup = data.setup && typeof data.setup === "object" ? data.setup : null;
        setHasSavedSetup(Boolean(persistedSetup));

        const savedProfileId = persistedSetup?.voiceProfileId || data.voiceProfileId || "";
        const savedPresetId = persistedSetup?.voicePresetId || data.voicePresetId || "";
        const savedProfileReady = readyProfiles.some((profile) => profile.id === savedProfileId);
        const savedPresetAvailable = presets.some((voice) => voice.id === savedPresetId);
        const defaultProfileId = readyProfiles[0]?.id || "";
        const defaultPresetId = presets[0]?.id || "";
        const selectedProfileId = savedProfileReady
          ? savedProfileId
          : (!savedPresetAvailable && defaultProfileId ? defaultProfileId : "");
        const selectedPresetId = savedPresetAvailable
          ? savedPresetId
          : (!selectedProfileId ? defaultPresetId : "");

        const initialChoices = {
          length: Number(persistedSetup?.length ?? data.suggestions.length.value),
          framework: persistedSetup?.framework || data.suggestions.framework.value,
          tone: persistedSetup?.tone || data.suggestions.tone.value,
          audienceLevel: persistedSetup?.audienceLevel || data.suggestions.audience.value,
          voiceProfileId: selectedProfileId,
          voicePresetId: selectedPresetId,
        };

        setChoices(initialChoices);
        setSavedChoices(initialChoices);
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

  useEffect(() => {
    if (!voicePickerOpen) return undefined;

    let frame = 0;
    const updatePlacement = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const picker = voicePickerRef.current;
        const menu = voiceMenuRef.current;
        if (!picker || !menu) return;

        const triggerRect = picker.getBoundingClientRect();
        const menuHeight = menu.getBoundingClientRect().height;
        const gap = 8;
        const spaceBelow = window.innerHeight - triggerRect.bottom - gap;
        const spaceAbove = triggerRect.top - gap;
        const shouldOpenUp = spaceBelow < menuHeight && spaceAbove > spaceBelow;

        setVoicePickerPlacement(shouldOpenUp ? "up" : "down");
      });
    };

    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [voicePickerOpen, voiceSearch, voiceProfiles.length, predefinedVoices.length]);

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

  const setupChoicesEqual = (left, right) => Boolean(
    left &&
    right &&
    Number(left.length) === Number(right.length) &&
    left.framework === right.framework &&
    left.tone === right.tone &&
    left.audienceLevel === right.audienceLevel &&
    left.voiceProfileId === right.voiceProfileId &&
    left.voicePresetId === right.voicePresetId
  );

  const isDirty = Boolean(choices && savedChoices && !setupChoicesEqual(choices, savedChoices));

  const changedFields = useMemo(() => {
    if (!choices || !savedChoices) return [];
    const fields = [
      ["length", "Script length"],
      ["framework", "Script template"],
      ["tone", "Tone"],
      ["audienceLevel", "Audience"],
      ["voiceProfileId", "Narration voice"],
      ["voicePresetId", "Narration voice"],
    ];
    return [...new Map(
      fields
        .filter(([key]) => choices[key] !== savedChoices[key])
        .map(([, label]) => [label, label])
    ).values()];
  }, [choices, savedChoices]);

  const selectedFrameworkLabel = choices ? (LABELS[choices.framework] || choices.framework) : "";
  const selectedVoiceLabel = selectedVoice?.name || "Choose a narrator";

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

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
      const saved = {
        length: Number(data.project?.setup?.length ?? choices.length),
        framework: data.project?.setup?.framework || choices.framework,
        tone: data.project?.setup?.tone || choices.tone,
        audienceLevel: data.project?.setup?.audienceLevel || choices.audienceLevel,
        voiceProfileId: data.project?.setup?.voiceProfileId || choices.voiceProfileId || "",
        voicePresetId: data.project?.setup?.voicePresetId || choices.voicePresetId || "",
      };
      setChoices(saved);
      setSavedChoices(saved);
      setHasSavedSetup(true);
      onDirtyChange?.(false);
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
      <header className="setup-panel__hero">
        <div className="setup-panel__hero-copy">
          <p className="eyebrow">Storyboard setup</p>
          <h2>{hasSavedSetup ? "Refine how the finished research becomes a reel." : "Shape how the research becomes a reel."}</h2>
          <p>{hasSavedSetup
            ? "Your research is already complete. Adjust the story settings below, then regenerate only when you are ready."
            : "The research is ready. Choose the storytelling direction and narrator before Helix writes the scenes."}</p>
        </div>
        <div className="setup-panel__hero-state">
          <span className="setup-state-dot" aria-hidden="true" />
          <div>
            <span className="mono-label">{hasSavedSetup ? "EDITING SAVED SETUP" : "READY TO CONFIGURE"}</span>
            <strong>Research stays unchanged</strong>
          </div>
        </div>
      </header>

      <section className="setup-research-bridge setup-research-bridge--compact" aria-labelledby="setup-research-bridge-title">
        <div className="setup-research-bridge__icon" aria-hidden="true">✓</div>
        <div className="setup-research-bridge__copy">
          <p className="mono-label">RESEARCH COMPLETE</p>
          <h3 id="setup-research-bridge-title">You are only changing the presentation layer.</h3>
          <p>Length, narrative framework, tone, audience, and narrator can change without rerunning the research.</p>
        </div>
        <span className="setup-research-bridge__badge">Research unchanged</span>
      </section>

      <section className="setup-summary" aria-label="Current setup summary">
        <div className="setup-summary__head">
          <div>
            <p className="mono-label">{hasSavedSetup ? "CURRENT SETUP" : "HELIX RECOMMENDATIONS"}</p>
            <strong>{isDirty ? changedFields.length + " setting" + (changedFields.length === 1 ? "" : "s") + " changed" : hasSavedSetup ? "Your saved configuration" : "Starting point for this story"}</strong>
          </div>
          <span className={isDirty ? "setup-summary__state is-dirty" : "setup-summary__state"}>
            {isDirty ? "Draft changes" : "No changes"}
          </span>
        </div>
        <div className="setup-summary__chips">
          <span><b>{choices.length}s</b><small>Length</small></span>
          <span><b>{selectedFrameworkLabel}</b><small>Template</small></span>
          <span><b>{choices.tone}</b><small>Tone</small></span>
          <span><b>{choices.audienceLevel}</b><small>Audience</small></span>
          <span><b>{selectedVoiceLabel}</b><small>Voice</small></span>
        </div>
      </section>

      <div className="setup-section-heading">
        <div>
          <p className="eyebrow">01 — Story direction</p>
          <h3>Make four focused decisions.</h3>
        </div>
        <span>Helix uses these settings when rebuilding the scenes.</span>
      </div>

      <ChoiceRow
        step={1}
        title="Script length"
        reasoning={suggestions.length.reasoning}
        options={suggestions.length.options}
        value={choices.length}
        recommendedValue={suggestions.length.value}
        onChange={(value) => setChoices((current) => ({ ...current, length: value }))}
        renderOption={(value) => String(value) + "s"}
      />
      <ChoiceRow
        step={2}
        title="Script template"
        reasoning={suggestions.framework.reasoning}
        options={suggestions.framework.options}
        value={choices.framework}
        recommendedValue={suggestions.framework.value}
        onChange={(value) => setChoices((current) => ({ ...current, framework: value }))}
        renderOption={(option) => LABELS[option.key] || option.label}
      />
      <ChoiceRow
        step={3}
        title="Tone"
        reasoning={suggestions.tone.reasoning}
        options={suggestions.tone.options}
        value={choices.tone}
        recommendedValue={suggestions.tone.value}
        onChange={(value) => setChoices((current) => ({ ...current, tone: value }))}
      />
      <ChoiceRow
        step={4}
        title="Audience"
        reasoning={suggestions.audience.reasoning}
        options={suggestions.audience.options}
        value={choices.audienceLevel}
        recommendedValue={suggestions.audience.value}
        onChange={(value) => setChoices((current) => ({ ...current, audienceLevel: value }))}
      />

      <div className="setup-section-heading setup-section-heading--voice">
        <div>
          <p className="eyebrow">02 — Narration</p>
          <h3>Choose the voice people will hear.</h3>
        </div>
        <span>Preview any voice before you commit the new storyboard.</span>
      </div>

      <section className="setup-choice setup-choice--voice">
        <div className="setup-choice__copy">
          <div className="setup-choice__eyebrow">
            <span className="setup-choice__step">05</span>
            <span className="mono-label">NARRATOR</span>
          </div>
          <div className="setup-choice__title-row">
            <h3>Narration voice</h3>
            {selectedVoice && <span className="setup-recommendation setup-recommendation--neutral">{selectedVoice.source === "clone" ? "Your clone" : "Predefined"}</span>}
          </div>
          <p>Choose your own cloned voice or a predefined narrator. Search and preview without leaving this stage.</p>
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
                <span className="setup-voice-trigger__avatar" aria-hidden="true">{voiceInitials(selectedVoice.name)}</span>
                <span className="setup-voice-trigger__details">
                  <span className="setup-voice-trigger__source">{selectedVoice.source === "clone" ? "YOUR CLONE" : "PREDEFINED"}</span>
                  <strong>{selectedVoice.name}</strong>
                  <span>{[selectedVoice.accent, selectedVoice.gender, selectedVoice.tone, selectedVoice.language].filter(Boolean).join(" · ")}</span>
                </span>
              </span>
            ) : (
              <span className="setup-voice-trigger__placeholder">Select a narration voice…</span>
            )}
            <span className="setup-voice-trigger__chevron" aria-hidden="true">⌄</span>
          </button>

          {voicePickerOpen && (
            <div
              ref={voiceMenuRef}
              className={"setup-voice-menu " + (voicePickerPlacement === "up" ? "is-up" : "is-down")}
              role="dialog"
              aria-label="Select narration voice"
            >
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
      <footer className={"setup-actions " + (isDirty ? "is-dirty" : "")}>
        <div className="setup-actions__status" aria-live="polite">
          <span className="setup-actions__status-dot" aria-hidden="true" />
          <div>
            <strong>{isDirty ? changedFields.length + " change" + (changedFields.length === 1 ? "" : "s") + " ready to apply" : hasSavedSetup ? "Setup is saved" : "Setup is ready"}</strong>
            <span>{isDirty ? "Storyboard, visuals, and narration will be regenerated from the same research." : "No regeneration happens until you change a setting."}</span>
          </div>
        </div>
        <button className="btn btn-cream" type="button" disabled={saving} onClick={save}>{saving ? "Applying changes…" : isDirty ? "Apply & regenerate storyboard →" : "Continue to storyboard →"}</button>
      </footer>
    </div>
  );
}
