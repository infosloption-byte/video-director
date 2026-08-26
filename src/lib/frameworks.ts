import type { FrameworkId, HookType } from "./types";

export const FRAMEWORKS: {
  id: FrameworkId;
  name: string;
  short: string;
  bestFor: string;
  hook: HookType;
}[] = [
  {
    id: "debunker",
    name: "The Debunker",
    short: "Challenge a belief people still treat as fact.",
    bestFor: "Myths, overhyped claims, and ‘stop doing this’ tips.",
    hook: "negative_warning",
  },
  {
    id: "how_it_works",
    name: "How It Works",
    short: "One mechanism, explained in plain language.",
    bestFor: "Hardware, tools, and scientific processes.",
    hook: "curiosity_gap",
  },
  {
    id: "future_timeline",
    name: "Future Timeline",
    short: "What the next 2 / 5 / 10 years actually look like.",
    bestFor: "Long-horizon tech: space, fusion, biotech.",
    hook: "transformation",
  },
  {
    id: "disruptor",
    name: "The Disruptor",
    short: "A small team just undercut the giant.",
    bestFor: "Cost breakthroughs, open-source, unexpected labs.",
    hook: "us_vs_them",
  },
];

export const HOOK_LABELS: Record<HookType, string> = {
  negative_warning: "Negative warning",
  curiosity_gap: "Curiosity gap",
  us_vs_them: "Us vs them",
  transformation: "Transformation tease",
  exposing_secrets: "Exposing secrets",
};

export const VOICES = [
  {
    id: "helix",
    name: "Helix",
    note: "Documentary, precise. Default for science explainers.",
  },
  {
    id: "eve",
    name: "Eve",
    note: "Bright and close-mic. Strong for hooks.",
  },
  {
    id: "orion",
    name: "Orion",
    note: "Lower, calm. Good for space and physics.",
  },
  {
    id: "luna",
    name: "Luna",
    note: "Warm and clear. Best for biotech stories.",
  },
  {
    id: "leo",
    name: "Leo",
    note: "Punchy. Use when the hook is a warning.",
  },
] as const;

export function frameworkById(id: FrameworkId) {
  return FRAMEWORKS.find((f) => f.id === id) ?? FRAMEWORKS[0];
}
