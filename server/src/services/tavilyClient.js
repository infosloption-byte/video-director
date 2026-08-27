const API_URL = "https://api.tavily.com/search";

export async function searchTavily(query, limit = 8) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: limit,
      search_depth: "basic",
      include_answer: false,
    }),
  });

  if (!res.ok) throw new Error(`Tavily returned ${res.status}`);
  const data = await res.json();

  return (data.results ?? []).map((item) => ({
    title: item.title?.trim(),
    description: item.content?.trim() || "",
    sourceName: (() => { try { return new URL(item.url).hostname.replace(/^www\./, ""); } catch { return "Tavily"; } })(),
    sourceUrl: item.url,
    sourceType: "tavily",
    sourceReliability: "ai_search",
    publishedAt: item.published_date ? new Date(item.published_date) : null,
    category: "TECHNOLOGY",
    relevance: Number(item.score) || 0,
  })).filter((item) => item.title && item.sourceUrl);
}
