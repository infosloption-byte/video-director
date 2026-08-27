const HN_API = "https://hacker-news.firebaseio.com/v0";
const REQUEST_HEADERS = { "user-agent": "HelixSignalFeed/1.0" };

async function fetchJson(path) {
  const response = await fetch(`${HN_API}/${path}`, {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Hacker News returned HTTP ${response.status}`);
  return response.json();
}

async function fetchItem(id) {
  return fetchJson(`item/${id}.json`);
}

export async function fetchHackerNewsStories({ limit = 40 } = {}) {
  const [topIds, newIds] = await Promise.all([
    fetchJson("topstories.json"),
    fetchJson("newstories.json"),
  ]);

  const ids = [...new Set([...topIds.slice(0, limit), ...newIds.slice(0, limit)])].slice(0, limit);
  const items = await Promise.allSettled(ids.map(fetchItem));

  return items
    .filter((result) => result.status === "fulfilled" && result.value?.type === "story")
    .map((result) => result.value)
    .filter((item) => item.title && item.url)
    .map((item) => ({
      title: item.title.trim(),
      description: `Hacker News discussion: ${item.score || 0} points and ${item.descendants || 0} comments.`,
      sourceUrl: item.url,
      sourceName: "Hacker News",
      sourceType: "hacker_news",
      sourceReliability: "general_web",
      category: inferHnCategory(item.title),
      publishedAt: new Date((item.time || Math.floor(Date.now() / 1000)) * 1000),
      rawContent: null,
      hnPoints: Number(item.score || 0),
      hnComments: Number(item.descendants || 0),
    }));
}

function inferHnCategory(title) {
  const value = title.toLowerCase();
  if (/\b(ai|llm|machine learning|model|neural|robot)\b/.test(value)) return "AI";
  if (/\b(chip|cpu|gpu|semiconductor|hardware|computer)\b/.test(value)) return "HARDWARE";
  if (/\b(space|nasa|rocket|satellite|astronomy)\b/.test(value)) return "SPACE";
  if (/\b(quantum|physics|photon|atom|superconduct)\b/.test(value)) return "PHYSICS";
  if (/\b(battery|energy|solar|nuclear|fusion)\b/.test(value)) return "ENERGY";
  return "TECHNOLOGY";
}
