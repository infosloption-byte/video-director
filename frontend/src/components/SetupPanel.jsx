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

export default function SetupPanel({ projectId, onComplete }) {
  const [suggestions, setSuggestions] = useState(null);
  const [voiceProfiles, setVoiceProfiles] = useState([]);
  const [predefinedVoices, setPredefinedVoices] = useState([]);
  const [voiceFilters, setVoiceFilters] = useState({ accents: [], genders: [], tones: [] });
  const [voiceAccent, setVoiceAccent] = useState("All");
  const [voiceGender, setVoiceGender] = useState("All");
  const [voiceTone, setVoiceTone] = useState("All");
  const [choices, setChoices] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState("");
  const [previewLoading, setPreviewLoading] = useState("");
  const previewAudioRef = useRef(null);
  const previewRequestRef = useRef(null);

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
        setVoiceFilters({
          accents: Array.isArray(presetsData.filters?.accents) ? presetsData.filters.accents : [],
          genders: Array.isArray(presetsData.filters?.genders) ? presetsData.filters.genders : [],
          tones: Array.isArray(presetsData.filters?.tones) ? presetsData.filters.tones : [],
        });

        const savedProfileId = data.voiceProfileId || "";
        const savedPresetId = data.voicePresetId || "";
        setChoices({
          length: data.suggestions.length.value,
          framework: data.suggestions.framework.value,
          tone: data.suggestions.tone.value,
          audienceLevel: data.suggestions.audience.value,
          voiceProfileId: savedProfileId || (!savedPresetId && readyProfiles[0]?.id ? readyProfiles[0].id : ""),
          voicePresetId: savedPresetId || (!savedProfileId && !readyProfiles[0]?.id ? presets[0]?.id || "" : ""),
        });
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load setup suggestions.");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => () => {
    previewRequestRef.current?.abort();
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
  }, []);

  const filteredPredefinedVoices = useMemo(() => predefinedVoices.filter((voice) => (
    (voiceAccent === "All" || voice.accent === voiceAccent) &&
    (voiceGender === "All" || voice.gender === voiceGender) &&
    (voiceTone === "All" || voice.tone === voiceTone)
  )), [predefinedVoices, voiceAccent, voiceGender, voiceTone]);

  function stopPreview() {
    previewRequestRef.current?.abort();
    previewRequestRef.current = null;
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
    setPreviewingVoice("");
    setPreviewLoading("");
  }

  async function previewVoice(previewKey) {
    if (previewingVoice === previewKey || previewLoading === previewKey) {
      stopPreview();
      return;
    }
    const [source, id] = previewKey.split(":");
    stopPreview();
    setPreviewLoading(previewKey);
    setError("");
    const controller = new AbortController();
    previewRequestRef.current = controller;
    try {
      const endpoint = source === "clone"
        ? `/api/voice-profiles/${encodeURIComponent(id)}/preview`
        : `/api/voice-presets/${encodeURIComponent(id)}/preview`;
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

  function selectClone(id) {
    setChoices((current) => ({ ...current, voiceProfileId: id, voicePresetId: "" }));
  }

  function selectPreset(id) {
    setChoices((current) => ({ ...current, voiceProfileId: "", voicePresetId: id }));
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

      <ChoiceRow
        title="Script length"
        reasoning={suggestions.length.reasoning}
        options={suggestions.length.options}
        value={choices.length}
        onChange={(value) => setChoices((current) => ({ ...current, length: value }))}
        renderOption={(value) => `${value}s`}
      />
      <ChoiceRow
        title="Script template"
        reasoning={suggestions.framework.reasoning}
        options={suggestions.framework.options}
        value={choices.framework}
        onChange={(value) => setChoices((current) => ({ ...current, framework: value }))}
        renderOption={(option) => LABELS[option.key] || option.label}
      />
      <ChoiceRow
        title="Tone"
        reasoning={suggestions.tone.reasoning}
        options={suggestions.tone.options}
        value={choices.tone}
        onChange={(value) => setChoices((current) => ({ ...current, tone: value }))}
      />
      <ChoiceRow
        title="Audience"
        reasoning={suggestions.audience.reasoning}
        options={suggestions.audience.options}
        value={choices.audienceLevel}
        onChange={(value) => setChoices((current) => ({ ...current, audienceLevel: value }))}
      />

      <section className="setup-choice setup-choice--voice">
        <div className="setup-choice__copy">
          <h3>Narration voice</h3>
          <p>Choose your own cloned voice or a built-in narrator. Preview any voice before continuing; narration is generated automatically with the selected voice.</p>
        </div>

        <div className="setup-voice-content">
          <div className="setup-voice-section">
            <div className="setup-voice-section__head">
              <div>
                <p className="mono-label">YOUR VOICE LIBRARY</p>
                <h4>Cloned voices</h4>
              </div>
              <a className="setup-voice-link" href="/voice-profiles">Manage voices</a>
            </div>

            {voiceProfiles.length ? (
              <div className="setup-voice-grid" role="radiogroup" aria-label="Your cloned voices">
                {voiceProfiles.map((profile) => {
                  const selected = choices.voiceProfileId === profile.id;
                  const previewKey = "clone:" + profile.id;
                  return (
                    <div
                      role="radio"
                      aria-checked={selected}
                      tabIndex={0}
                      className={"setup-voice-card " + (selected ? "is-selected" : "")}
                      key={profile.id}
                      onClick={() => selectClone(profile.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectClone(profile.id);
                        }
                      }}
                    >
                      <span className="setup-voice-card__topline">
                        <span className="setup-voice-card__status">YOUR CLONE</span>
                        <PreviewButton previewKey={previewKey} previewingVoice={previewingVoice} previewLoading={previewLoading} onPreview={previewVoice} />
                      </span>
                      <strong>{profile.name}</strong>
                      <span className="setup-voice-card__description">Your cloned voice profile</span>
                      <span className="setup-voice-card__meta">{profile.preferredEngine === "qwen3-tts-0.6b" ? "Qwen3-TTS 0.6B" : "Chatterbox-Nano"} · {profile.language || "English"}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="setup-voice-empty">
                <div>
                  <strong>No ready cloned voices yet.</strong>
                  <span>Create a voice profile and come back here when cloning is complete.</span>
                </div>
                <a className="btn btn-ghost" href="/voice-profiles">Create a voice</a>
              </div>
            )}
          </div>

          <div className="setup-voice-divider" aria-hidden="true" />

          <div className="setup-voice-section">
            <div className="setup-voice-section__head setup-voice-section__head--stacked">
              <div>
                <p className="mono-label">BUILT-IN VOICE LIBRARY</p>
                <h4>Predefined voices</h4>
                <span>English narrators with different accents, genders, and delivery styles.</span>
              </div>
            </div>

            <div className="setup-voice-filters" aria-label="Filter predefined voices">
              <div>
                <label htmlFor="voice-accent-filter">Accent</label>
                <select id="voice-accent-filter" value={voiceAccent} onChange={(event) => setVoiceAccent(event.target.value)}>
                  <option value="All">All accents</option>
                  {voiceFilters.accents.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="voice-gender-filter">Gender</label>
                <select id="voice-gender-filter" value={voiceGender} onChange={(event) => setVoiceGender(event.target.value)}>
                  <option value="All">All genders</option>
                  {voiceFilters.genders.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="voice-tone-filter">Tone / style</label>
                <select id="voice-tone-filter" value={voiceTone} onChange={(event) => setVoiceTone(event.target.value)}>
                  <option value="All">All styles</option>
                  {voiceFilters.tones.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <span className="setup-voice-count">{filteredPredefinedVoices.length} voices</span>
            </div>

            <div className="setup-voice-grid" role="radiogroup" aria-label="Predefined voices">
              {filteredPredefinedVoices.map((voice) => {
                const selected = choices.voicePresetId === voice.id;
                const previewKey = "preset:" + voice.id;
                return (
                  <div
                    role="radio"
                    aria-checked={selected}
                    tabIndex={0}
                    className={"setup-voice-card " + (selected ? "is-selected" : "")}
                    key={voice.id}
                    onClick={() => selectPreset(voice.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectPreset(voice.id);
                      }
                    }}
                  >
                    <span className="setup-voice-card__topline">
                      <span className="setup-voice-card__tags">
                        <span>{voice.accent}</span>
                        <span>{voice.gender}</span>
                      </span>
                      <PreviewButton previewKey={previewKey} previewingVoice={previewingVoice} previewLoading={previewLoading} onPreview={previewVoice} />
                    </span>
                    <strong>{voice.name}</strong>
                    <span className="setup-voice-card__description">{voice.description}</span>
                    <span className="setup-voice-card__meta">{voice.tone} · {voice.engine}</span>
                  </div>
                );
              })}
            </div>
            {!filteredPredefinedVoices.length && <div className="setup-voice-filter-empty">No predefined voices match the selected filters.</div>}
          </div>
        </div>
      </section>

      {suggestions.framework.guardrailApplied && <div className="setup-guardrail"><strong>Monetization guardrail applied.</strong> Helix selected a safer narrative because the research flagged a high-risk issue.</div>}
      {error && <div className="setup-error"><span>{error}</span></div>}
      <div className="setup-actions">
        <button className="btn btn-cream" type="button" disabled={saving} onClick={save}>{saving ? "Saving…": "Continue to storyboard →"}</button>
      </div>
    </div>
  );
}
