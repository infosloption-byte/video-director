import { prisma } from "../db/client.js";
const LENGTHS = [15, 30, 45, 60];
const TONES = ["Energetic", "Calm & authoritative", "Conversational"];
const AUDIENCES = ["General public", "Enthusiast"];
const FRAMEWORKS = [
  { key: "disruptor", aliases: ["CONTRAST", "DISRUPTOR"], label: "The Disruptor" },
  { key: "how-it-works", aliases: ["EXPLAINER", "HOW-IT-WORKS", "HOW_IT_WORKS"], label: "How It Works" },
  { key: "skeptic", aliases: ["CONTEXT", "SKEPTIC"], label: "The Skeptic" },
  { key: "countdown", aliases: ["PROBLEM", "COUNTDOWN"], label: "The Countdown" },
];

export async function getSetupCatalog(db = prisma) {
  const rows = await db.platformMasterItem.findMany({ where: { category: { in: ["tone", "audience"] }, active: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }], select: { category: true, label: true } });
  const tones = rows.filter(row => row.category === "tone").map(row => row.label);
  const audiences = rows.filter(row => row.category === "audience").map(row => row.label);
  return { tones: tones.length ? tones : TONES, audiences: audiences.length ? audiences : AUDIENCES };
}
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

function researchSources(project) {
  if (Array.isArray(project?.researchSources)) return project.researchSources;
  if (Array.isArray(project?.researchSources?.sources)) return project.researchSources.sources;
  return [];
}

export function buildSetupSuggestions(project, catalog = { tones: TONES, audiences: AUDIENCES }) {
  const tones = catalog.tones;
  const audiences = catalog.audiences;
  const flags = Array.isArray(project.monetizationFlags) ? project.monetizationFlags : [];
  const risky = hasHighRisk(flags);
  const aiFramework = normalizeFramework(project.suggestedFramework);
  const selectedFramework = risky && aiFramework === "disruptor" ? "how-it-works" : aiFramework;
  const frameworkWasGuarded = selectedFramework !== aiFramework;

  const length = LENGTHS.includes(Number(project.suggestedLengthSeconds))
    ? Number(project.suggestedLengthSeconds)
    : 30;
  const tone = tones.includes(project.suggestedTone) ? project.suggestedTone : (tones.includes("Calm & authoritative") ? "Calm & authoritative" : tones[0]);
  const sources = researchSources(project);
  const audience = sources.some((source) => source?.source_reliability === "peer_reviewed")
    ? (audiences.includes("General public") ? "General public" : audiences[0])
    : (audiences.includes("General public") ? "General public" : audiences[0]);

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
      options: tones,
      value: tone,
      reasoning: tone === "Energetic"
        ? "The finding has breakthrough energy and benefits from a fast, confident delivery."
        : tone === "Conversational"
          ? "The topic benefits from a direct, approachable explanation rather than a formal lecture."
          : "A clear, measured delivery keeps the mechanism credible and easy to follow.",
    },
    audience: {
      options: audiences,
      value: audience,
      reasoning: "Start with the general public so the mechanism is understandable without specialist knowledge.",
    },
  };
}

export function validateSetup(input = {}, catalog = { tones: TONES, audiences: AUDIENCES }) {
  const length = Number(input.length);
  const framework = normalizeFramework(input.framework);
  const tone = catalog.tones.includes(input.tone) ? input.tone : null;
  const audienceLevel = catalog.audiences.includes(input.audienceLevel) ? input.audienceLevel : null;
  if (!LENGTHS.includes(length) || !FRAMEWORKS.some((item) => item.key === framework) || !tone || !audienceLevel) {
    return { error: "Choose a valid script length, framework, tone, and audience level." };
  }
  return { value: { length, framework, tone, audienceLevel } };
}

export { FRAMEWORKS, LENGTHS, TONES, AUDIENCES, normalizeFramework };
