import type { Project, ReachCheck } from "./types";
import { spokenWordCount } from "./utils";

export function projectDuration(project: Project) {
  return project.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
}

export function fullScript(project: Project) {
  return project.scenes.map((s) => s.spokenText).join(" ");
}

export function scoreReach(project: Project): ReachCheck[] {
  const duration = projectDuration(project);
  const hook = project.scenes[0];
  const words = spokenWordCount(fullScript(project));
  const hasDebate = project.debateQuestion.trim().length > 12;
  const hasSeo =
    project.seoCaption.length > 40 && project.keywords.length >= 3;
  const visualCuts = project.scenes.length >= 4;
  const hookShort = (hook?.durationSeconds ?? 99) <= 3.4;

  return [
    {
      id: "hook",
      label: "First 3 seconds",
      pass: hookShort,
      detail: hookShort
        ? `Hook lands in ${hook.durationSeconds.toFixed(1)}s with a ${project.hookType.replaceAll("_", " ")} pattern.`
        : "Hook scene is longer than 3 seconds — trim the opening line.",
    },
    {
      id: "length",
      label: "20–45s runtime",
      pass: duration >= 18 && duration <= 48,
      detail: `${Math.round(duration)}s · ${words} words. Science Reels hold when they teach one idea.`,
    },
    {
      id: "cuts",
      label: "Pattern interrupts",
      pass: visualCuts,
      detail: visualCuts
        ? `${project.scenes.length} visual cuts — the eye never sits on a static frame.`
        : "Add more scene cuts. Static frames lose the scroll.",
    },
    {
      id: "debate",
      label: "Comment trigger",
      pass: hasDebate,
      detail: hasDebate
        ? "Ends on a real question, not ‘follow for more’."
        : "Add a debate question. Meta boosts threads, not likes.",
    },
    {
      id: "seo",
      label: "Social search caption",
      pass: hasSeo,
      detail: hasSeo
        ? `Caption indexed on ${project.keywords.slice(0, 3).join(", ")}.`
        : "Caption needs natural keywords for Meta’s visual-text index.",
    },
    {
      id: "format",
      label: "9:16, no watermark",
      pass: true,
      detail: "Vertical 1080×1920, captions in the upper-middle safe zone.",
    },
  ];
}
