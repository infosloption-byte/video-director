import { searchSemanticScholar } from "./semanticScholarClient.js";
import { searchTavily } from "./tavilyClient.js";
import { searchBrave } from "./braveSearchClient.js";

const RELIABILITY_RANK = {
  peer_reviewed: 3,
  ai_search: 2,
  general_web: 1,
};

function normalizeTitle(value = "") {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function titleSimilarity(a, b) {
  const left = new Set(normalizeTitle(a).split(" ").filter(Boolean));
  const right = new Set(normalizeTitle(b).split(" ").filter(Boolean));
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((word) => right.has(word)).length;
  return intersection / Math.max(left.size, right.size);
}

function dedupe(results) {
  const byUrl = new Map();
  const output = [];

  for (const result of results) {
    const url = result.sourceUrl?.toLowerCase().replace(/#.*$/, "");
    if (url && byUrl.has(url)) continue;
    if (url) byUrl.set(url, true);

    const duplicate = output.find((item) => titleSimilarity(item.title, result.title) >= 0.82);
    if (duplicate) {
      if (RELIABILITY_RANK[result.sourceReliability] > RELIABILITY_RANK[duplicate.sourceReliability]) {
        Object.assign(duplicate, result);
      }
      continue;
    }
    output.push(result);
  }
  return output;
}

function score(result, query) {
  const text = `${result.title} ${result.description}`.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const relevance = terms.length ? terms.filter((term) => text.includes(term)).length / terms.length : 0;
  const recency = result.publishedAt instanceof Date && !Number.isNaN(result.publishedAt.getTime())
    ? Math.max(0, 1 - (Date.now() - result.publishedAt.getTime()) / (1000 * 60 * 60 * 24 * 365))
    : 0;
  return RELIABILITY_RANK[result.sourceReliability] * 100 + relevance * 20 + recency * 5 + (result.relevance || 0) * 5;
}

export async function searchSourceCascade(query) {
  const trimmed = String(query || "").trim();
  if (!trimmed) return [];

  const settled = await Promise.allSettled([
    searchSemanticScholar(trimmed),
    searchTavily(trimmed),
    searchBrave(trimmed),
  ]);

  const results = settled.flatMap((item) => item.status === "fulfilled" ? item.value : []);
  const merged = dedupe(results);

  return merged
    .map((result) => ({ ...result, searchScore: score(result, trimmed) }))
    .sort((a, b) => b.searchScore - a.searchScore)
    .slice(0, 20);
}
