const ARXIV_URL = "https://export.arxiv.org/api/query";
const REQUEST_HEADERS = {
  "user-agent": "HelixSignalFeed/1.0 (+https://github.com/infosloption-byte/video-director)",
  accept: "application/atom+xml, application/xml;q=0.9, */*;q=0.8",
};

const CATEGORY_QUERIES = [
  "cat:cs.AI",
  "cat:cs.LG",
  "cat:quant-ph",
  "cat:physics",
  "cat:astro-ph",
  "cat:bio-ph",
];

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function readTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
}

function readPrimaryLink(block) {
  const match = block.match(/<link\s[^>]*href=["']([^"']+)["'][^>]*>/i);
  return match ? decodeXml(match[1]) : "";
}

function categoryFromEntry(block) {
  const categories = [...block.matchAll(/<category\s+[^>]*term=["']([^"']+)["'][^>]*\/?\s*>/gi)].map((m) => m[1]);
  const value = categories.join(" ").toLowerCase();
  if (/cs\.ai|cs\.lg/.test(value)) return "AI";
  if (/quant-ph|physics/.test(value)) return "PHYSICS";
  if (/astro-ph/.test(value)) return "SPACE";
  if (/bio-ph/.test(value)) return "BIOTECH";
  return "SCIENCE";
}

function parseEntries(xml) {
  return [...xml.matchAll(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi)]
    .map((match) => match[0])
    .map((block) => {
      const title = readTag(block, "title");
      const summary = readTag(block, "summary");
      const sourceUrl = readPrimaryLink(block);
      const publishedAt = new Date(readTag(block, "published") || readTag(block, "updated"));

      if (!title || !sourceUrl) return null;
      return {
        title,
        description: summary.slice(0, 4000),
        sourceUrl,
        sourceName: "arXiv",
        sourceType: "arxiv",
        sourceReliability: "peer_reviewed",
        category: categoryFromEntry(block),
        publishedAt: Number.isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
        rawContent: summary.slice(0, 12000),
      };
    })
    .filter(Boolean);
}

async function fetchCategory(category) {
  const params = new URLSearchParams({
    search_query: category,
    start: "0",
    max_results: "20",
    sortBy: "submittedDate",
    sortOrder: "descending",
  });

  const response = await fetch(`${ARXIV_URL}?${params}`, {
    headers: REQUEST_HEADERS,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`arXiv returned HTTP ${response.status}`);
  return parseEntries(await response.text());
}

export async function fetchArxivPapers() {
  const results = await Promise.allSettled(CATEGORY_QUERIES.map(fetchCategory));
  const items = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      items.push(...result.value);
      console.log(`[signals] arXiv ${CATEGORY_QUERIES[index]}: ${result.value.length} items`);
    } else {
      console.warn(`[signals] arXiv ${CATEGORY_QUERIES[index]} failed: ${result.reason?.message || result.reason}`);
    }
  });

  return items;
}
