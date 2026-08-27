import { prisma } from "../db/client.js";
import { scrapeRssFeeds, inferCategory } from "./rssScraper.js";
import { fetchHackerNewsStories } from "./hackerNewsClient.js";
import { fetchArxivPapers } from "./arxivClient.js";

const MAX_SIGNAL_AGE_HOURS = 96;
const MAX_SIGNALS_TO_STORE = 60;

function normalizeTitle(title = "") {
  return title
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(study|research|new|shows|reveals|could|may|says|using|with)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(title) {
  return new Set(normalizeTitle(title).split(" ").filter((token) => token.length > 2));
}

function titleSimilarity(a, b) {
  const left = titleTokens(a);
  const right = titleTokens(b);
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / Math.min(left.size, right.size);
}

function sameUrl(a, b) {
  try {
    return new URL(a).href.replace(/\/$/, "") === new URL(b).href.replace(/\/$/, "");
  } catch {
    return a === b;
  }
}

function ageHours(date) {
  return Math.max(0, (Date.now() - new Date(date).getTime()) / 36e5);
}

function recencyScore(date) {
  return Math.max(0, 30 * (1 - Math.min(ageHours(date), MAX_SIGNAL_AGE_HOURS) / MAX_SIGNAL_AGE_HOURS));
}

function frequencyBoost(item, items) {
  const matches = items.filter((candidate) => titleSimilarity(item.title, candidate.title) >= 0.8).length;
  return Math.min(20, Math.max(0, matches - 1) * 10);
}

function sourceScore(item) {
  if (item.sourceType === "hacker_news") {
    const points = Math.log1p(item.hnPoints || 0) * 5;
    const comments = Math.log1p(item.hnComments || 0) * 2;
    return Math.min(60, points + comments);
  }
  if (item.sourceType === "arxiv") return recencyScore(item.publishedAt) + 5;
  return recencyScore(item.publishedAt) + 10;
}

function heatScore(item, allItems) {
  return Number((sourceScore(item) + frequencyBoost(item, allItems)).toFixed(2));
}

function heatPercent(score, maxScore) {
  if (!maxScore) return "+0%";
  return `+${Math.max(1, Math.round((score / maxScore) * 400))}%`;
}

function describeHeat(item, score, rank, nextScore, allItems) {
  const delta = nextScore > 0 ? Math.max(0, score - nextScore) : score;
  const pieces = [];

  if (item.sourceType === "hacker_news") {
    pieces.push(`${item.hnPoints || 0} Hacker News points and ${item.hnComments || 0} comments`);
  } else if (item.sourceType === "arxiv") {
    pieces.push(`${Math.round(recencyScore(item.publishedAt))}/30 recency points from a fresh paper`);
  } else {
    pieces.push(`${Math.round(recencyScore(item.publishedAt))}/30 recency points from recent coverage`);
  }

  const frequency = frequencyBoost(item, allItems);
  if (frequency > 0) pieces.push(`+${frequency} cross-source coverage points`);

  return `Ranked #${rank}: heat score ${score.toFixed(2)} (${delta.toFixed(2)} points above the next result), driven by ${pieces.join(" and ")}.`;
}

function dedupeItems(items) {
  const unique = [];
  for (const item of items) {
    if (!item?.title || !item?.sourceUrl) continue;
    if (unique.some((existing) => sameUrl(existing.sourceUrl, item.sourceUrl))) continue;
    if (unique.some((existing) => titleSimilarity(existing.title, item.title) >= 0.9)) continue;
    unique.push(item);
  }
  return unique;
}

function toSignalData(item, score, rank, maxScore, nextScore, allItems) {
  const category = item.category || inferCategory(`${item.title} ${item.description || ""}`);
  return {
    origin: "suggested",
    sourceType: item.sourceType,
    sourceReliability: item.sourceReliability,
    rank,
    category,
    heatPct: heatPercent(score, maxScore),
    heatScore: score,
    title: item.title.slice(0, 255),
    description: (item.description || "").slice(0, 5000),
    whyReasoning: describeHeat(item, score, rank, nextScore, allItems),
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    rawContent: item.rawContent ? item.rawContent.slice(0, 12000) : null,
    status: "new",
  };
}

export async function scrapeAndStoreSuggestedSignals() {
  const startedAt = Date.now();
  console.log("[signals] Starting suggested feed scrape...");

  const [rss, hackerNews, arxiv] = await Promise.all([
    scrapeRssFeeds(),
    fetchHackerNewsStories({ limit: 40 }),
    fetchArxivPapers(),
  ]);

  const cutoff = Date.now() - MAX_SIGNAL_AGE_HOURS * 36e5;
  const recent = [...rss, ...hackerNews, ...arxiv].filter(
    (item) => new Date(item.publishedAt).getTime() >= cutoff,
  );
  const unique = dedupeItems(recent);

  const scored = unique
    .map((item) => ({ item, score: heatScore(item, unique) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SIGNALS_TO_STORE);

  const maxScore = scored[0]?.score || 0;
  const rows = scored.map(({ item, score }, index) => {
    const nextScore = scored[index + 1]?.score || 0;
    return toSignalData(item, score, index + 1, maxScore, nextScore, unique);
  });

  let stored = 0;
  for (const row of rows) {
    const existing = await prisma.signal.findFirst({
      where: { origin: "suggested", sourceUrl: row.sourceUrl },
      select: { id: true },
    });

    if (existing) {
      await prisma.signal.update({ where: { id: existing.id }, data: row });
    } else {
      await prisma.signal.create({ data: row });
    }
    stored += 1;
  }

  // Keep previously used projects safe: only archive old suggested rows that
  // are still `new` and were not refreshed by this scrape.
  const activeUrls = rows.map((row) => row.sourceUrl);
  await prisma.signal.updateMany({
    where: {
      origin: "suggested",
      status: "new",
      ...(activeUrls.length ? { sourceUrl: { notIn: activeUrls } } : {}),
    },
    data: { status: "archived" },
  });

  console.log(`[signals] Stored ${stored} suggested signals in ${Date.now() - startedAt}ms.`);
  return { stored, scraped: recent.length, unique: unique.length };
}
