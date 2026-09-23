import { useEffect, useState } from "react";

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
              className={`setup-pill ${selected ? "is-selected" : ""}`}
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

export default function SetupPanel({ projectId, onComplete }) {
  const [suggestions, setSuggestions] = useState(null);
  const [voiceProfiles, setVoiceProfiles] = useState([]);
  const [choices, setChoices] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [suggestionsResponse, profilesResponse] = await Promise.all([
          fetch(`/api/projects/${projectId}/setup/suggestions`),
          fetch("/api/voice-profiles"),
        ]);
        const data = await suggestionsResponse.json().catch(() => ({}));
        const profilesData = await profilesResponse.json().catch(() => ({}));
        if (!suggestionsResponse.ok) throw new Error(data.error || "Failed to load setup suggestions.");
        if (!profilesResponse.ok) throw new Error(profilesData.error || "Failed to load voice profiles.");
        if (cancelled) return;
        const readyProfiles = Array.isArray(profilesData.profiles)
          ? profilesData.profiles.filter((profile) => profile.status === "ready" && profile.ttsVoiceId)
          : [];
        setSuggestions(data.suggestions);
        setVoiceProfiles(readyProfiles);
        setChoices({
          length: data.suggestions.length.value,
          framework: data.suggestions.framework.value,
          tone: data.suggestions.tone.value,
          audienceLevel: data.suggestions.audience.value,
          voiceProfileId: data.project?.voiceProfileId || readyProfiles[0]?.id || "",
        });
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load setup suggestions.");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [projectId]);

  async function save() {
    if (!choices) return;
    setSaving(true);
    setError("");
    try {
      if (!choices.voiceProfileId) {
        throw new Error("Select a saved voice profile before continuing to the storyboard.");
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
        <p>Helix has already completed the research for this project. Choose how that research should be turned into a short-form story.</p>
      </div>

      <section className="setup-research-bridge" aria-labelledby="setup-research-bridge-title">
        <div className="setup-research-bridge__icon" aria-hidden="true">✓</div>
        <div className="setup-research-bridge__copy">
          <p className="mono-label">RESEARCH FOUNDATION</p>
          <h3 id="setup-research-bridge-title">This setup stays connected to the completed research</h3>
          <p>The storyboard will use the same persisted research corpus for this project. Setup only controls presentation — length, narrative framework, tone, and audience — not the factual foundation.</p>
          <div className="setup-research-bridge__flow" aria-label="Research to storyboard flow">
            <span>Completed research</span>
            <span aria-hidden="true">→</span>
            <strong>Guided setup</strong>
            <span aria-hidden="true">→</span>
            <span>Research-grounded storyboard</span>
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
          <p>Select the saved voice profile that will narrate this storyboard. Narration is generated automatically when the storyboard is created.</p>
        </div>
        {voiceProfiles.length ? (
          <div className="setup-voice-grid" role="radiogroup" aria-label="Narration voice">
            {voiceProfiles.map((profile) => {
              const selected = choices.voiceProfileId === profile.id;
              return (
                <button type="button" role="radio" aria-checked={selected}
                  className={"setup-voice-card " + (selected ? "is-selected" : "")}
                  key={profile.id}
                  onClick={() => setChoices((current) => ({ ...current, voiceProfileId: profile.id }))}>
                  <span className="setup-voice-card__status">READY</span>
                  <strong>{profile.name}</strong>
                  <span>{profile.preferredEngine === "qwen3-tts-0.6b" ? "Qwen3-TTS 0.6B" : "Chatterbox-Nano"} · {profile.language || "English"}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="setup-voice-empty">
            <span>No ready voice profiles yet.</span>
            <a className="btn btn-ghost" href="/voice-profiles">Create a voice profile</a>
          </div>
        )}
      </section>

      {suggestions.framework.guardrailApplied && <div className="setup-guardrail"><strong>Monetization guardrail applied.</strong> Helix selected a safer narrative because the research flagged a high-risk issue.</div>}
      {error && <div className="setup-error"><span>{error}</span></div>}
      <div className="setup-actions">
        <button className="btn btn-cream" type="button" disabled={saving} onClick={save}>{saving ? "Saving…" : "Continue to storyboard →"}</button>
      </div>
    </div>
  );
}
