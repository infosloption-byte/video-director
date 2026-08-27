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
  const [choices, setChoices] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/projects/${projectId}/setup/suggestions`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Failed to load setup suggestions.");
        if (cancelled) return;
        setSuggestions(data.suggestions);
        setChoices({
          length: data.suggestions.length.value,
          framework: data.suggestions.framework.value,
          tone: data.suggestions.tone.value,
          audienceLevel: data.suggestions.audience.value,
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
        <h2>Four choices. Helix already picked the starting point.</h2>
        <p>Keep the recommendations or change any choice in one tap. Nothing here requires typing.</p>
      </div>

      <ChoiceRow title="Script length" reasoning={suggestions.length.reasoning} options={suggestions.length.options} value={choices.length} onChange={(value) => setChoices((current) => ({ ...current, length: value }))} renderOption={(value) => `${value}s`} />
      <ChoiceRow title="Script template" reasoning={suggestions.framework.reasoning} options={suggestions.framework.options} value={choices.framework} onChange={(value) => setChoices((current) => ({ ...current, framework: value }))} renderOption={(option) => LABELS[option.key] || option.label} />
      <ChoiceRow title="Tone" reasoning={suggestions.tone.reasoning} options={suggestions.tone.options} value={choices.tone} onChange={(value) => setChoices((current) => ({ ...current, tone: value }))} />
      <ChoiceRow title="Audience" reasoning={suggestions.audience.reasoning} options={suggestions.audience.options} value={choices.audienceLevel} onChange={(value) => setChoices((current) => ({ ...current, audienceLevel: value }))} />

      {suggestions.framework.guardrailApplied && <div className="setup-guardrail"><strong>Monetization guardrail applied.</strong> Helix selected a safer narrative because the research flagged a high-risk issue.</div>}
      {error && <div className="setup-error"><span>{error}</span></div>}
      <div className="setup-actions">
        <button className="btn btn-cream" type="button" disabled={saving} onClick={save}>{saving ? "Saving…" : "Continue to storyboard →"}</button>
      </div>
    </div>
  );
}
