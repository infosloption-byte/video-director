const API_URL = "https://api.semanticscholar.org/graph/v1/paper/search";

export async function searchSemanticScholar(query, limit = 8) {
  const url = new URL(API_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("fields", "title,abstract,url,externalIds,publicationDate,venue,authors");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Semantic Scholar returned ${res.status}`);
  const data = await res.json();

  return (data.data ?? []).map((paper) => ({
    title: paper.title?.trim(),
    description: paper.abstract?.trim() || "Peer-reviewed research relevant to this topic.",
    sourceName: paper.venue || "Semantic Scholar",
    sourceUrl: paper.url || (paper.externalIds?.DOI ? `https://doi.org/${paper.externalIds.DOI}` : null),
    sourceType: "semantic_scholar",
    sourceReliability: "peer_reviewed",
    publishedAt: paper.publicationDate ? new Date(paper.publicationDate) : null,
    category: "SCIENCE",
  })).filter((item) => item.title && item.sourceUrl);
}
