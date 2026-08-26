import type { Category, FrameworkId, Topic } from "./types";
import { uid } from "./utils";

const CATEGORIES: Category[] = [
  "Space",
  "Energy",
  "Biotech",
  "AI",
  "Hardware",
  "Physics",
];
const FRAMEWORKS: FrameworkId[] = [
  "debunker",
  "how_it_works",
  "future_timeline",
  "disruptor",
];

export function parseTopics(raw: unknown): Topic[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 8).map((item) => {
    const t = (item ?? {}) as Record<string, unknown>;
    const category = CATEGORIES.includes(t.category as Category)
      ? (t.category as Category)
      : "Physics";
    const suggestedFramework = FRAMEWORKS.includes(
      t.suggestedFramework as FrameworkId,
    )
      ? (t.suggestedFramework as FrameworkId)
      : "how_it_works";
    return {
      id: uid(),
      headline: String(t.headline ?? "Untitled signal"),
      source: String(t.source ?? "Desk"),
      category,
      blurb: String(t.blurb ?? ""),
      trendReasoning: String(t.trendReasoning ?? "Editor-selected signal."),
      searchDelta:
        typeof t.searchDelta === "number" ? Math.round(t.searchDelta) : 120,
      rawContent: String(t.rawContent ?? t.blurb ?? ""),
      suggestedFramework,
    };
  });
}
