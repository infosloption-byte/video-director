const LENGTHS = [15, 30, 45, 60];
const TONES = ["Energetic", "Calm & authoritative", "Conversational"];
const AUDIENCES = ["General public", "Enthusiast"];
const FRAMEWORKS = [
  { key: "disruptor", aliases: ["CONTRAST", "DISRUPTOR"], label: "The Disruptor" },
  { key: "how-it-works", aliases: ["EXPLAINER", "HOW-IT-WORKS", "HOW_IT_WORKS"], label: "How It Works" },
  { key: "skeptic", aliases: ["CONTEXT", "SKEPTIC"], label: "The Skeptic" },
  { key: "countdown", aliases: ["PROBLEM", "COUNTDOWN"], label: "The Countdown" },
];

function normalizeFramework(value) {
  const raw = String(value || "").trim().toUpperCase();
  return FRAMEWORKS.find((item) => item.aliases.includes(raw))?.key || "how-it-works";
}

function hasHighRisk(flags = []) {
  return Array.isArray(flags) && flags.some((flag) => String(flag?.severity || "").toLowerCase() === "high");
}

function frameworkLabel(key) {
  return FRAMEWORKS.find((item) => item.key === key)?.label || "How It Works";
}

export function buildSetupSuggestions(project) {
  const flags = Array.isArray(project.monetizationFlags) ? project.monetizationFlags : [];
  const risky = hasHighRisk(flags);
  const aiFramework = normalizeFramework(project.suggestedFramework);
  const selectedFramework = risky && aiFramework === "disruptor" ? "how-it-works" : aiFramework;
  const frameworkWasGuarded = selectedFramework !== aiFramework;

  const length = LENGTHS.includes(Number(project.suggestedLengthSeconds))
    ? Number(project.suggestedLengthSeconds)
    : 30;
  const tone = TONES.includes(project.suggestedTone) ? project.suggestedTone : "Calm & authoritative";
  const audience = project.researchSources?.some((source) => source?.source_reliability === "peer_reviewed")
    ? "General public"
    : "General public";

  return {
    length: {
      options: LENGTHS,
      value: length,
      reasoning: length <= 30
        ? "The research has enough evidence for a tight reel without stretching thin source material."
        : "The research supports a longer explanation without forcing filler into the script.",
    },
    framework: {
      options: FRAMEWORKS.map(({ key, label }) => ({ key, label })),
      value: selectedFramework,
      reasoning: frameworkWasGuarded
        ? `${frameworkLabel(aiFramework)} was the narrative match, but a high monetization-risk flag makes ${frameworkLabel(selectedFramework)} the safer choice.`
        : `The research brief recommends ${frameworkLabel(selectedFramework)} because it best matches the evidence and mechanism in this signal.`,
      guardrailApplied: frameworkWasGuarded,
    },
    tone: {
      options: TONES,
      value: tone,
      reasoning: tone === "Energetic"
        ? "The finding has breakthrough energy and benefits from a fast, confident delivery."
        : tone === "Conversational"
          ? "The topic benefits from a direct, approachable explanation rather than a formal lecture."
          : "A clear, measured delivery keeps the mechanism credible and easy to follow.",
    },
    audience: {
      options: AUDIENCES,
      value: audience,
      reasoning: "Start with the general public so the mechanism is understandable without specialist knowledge.",
    },
  };
}

export function validateSetup(input = {}) {
  const length = Number(input.length);
  const framework = normalizeFramework(input.framework);
  const tone = TONES.includes(input.tone) ? input.tone : null;
  const audienceLevel = AUDIENCES.includes(input.audienceLevel) ? input.audienceLevel : null;
  if (!LENGTHS.includes(length) || !FRAMEWORKS.some((item) => item.key === framework) || !tone || !audienceLevel) {
    return { error: "Choose a valid script length, framework, tone, and audience level." };
  }
  return { value: { length, framework, tone, audienceLevel } };
}

export { FRAMEWORKS, LENGTHS, TONES, AUDIENCES, normalizeFramework };
