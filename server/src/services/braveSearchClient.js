const API_URL = "https://api.search.brave.com/res/v1/web/search";

export async function searchBrave(query, limit = 8) {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) return [];

  const url = new URL(API_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(limit));

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!res.ok) throw new Error(`Brave Search returned ${res.status}`);
  const data = await res.json();

  return (data.web?.results ?? []).map((item) => ({
    title: item.title?.trim(),
    description: item.description?.trim() || "",
    sourceName: (() => { try { return new URL(item.url).hostname.replace(/^www\./, ""); } catch { return "Brave Search"; } })(),
    sourceUrl: item.url,
    sourceType: "brave",
    sourceReliability: "general_web",
    publishedAt: item.age ? new Date(item.age) : null,
    category: "TECHNOLOGY",
  })).filter((item) => item.title && item.sourceUrl);
}
