const RSS_FEEDS = [
  {
    name: "Nature",
    url: "https://feeds.nature.com/nature/rss/current",
    category: "SCIENCE",
    sourceReliability: "peer_reviewed",
  },
  {
    name: "ScienceDaily",
    url: "https://www.sciencedaily.com/rss/top/science.xml",
    category: "SCIENCE",
    sourceReliability: "general_web",
  },
  {
    name: "MIT Technology Review",
    url: "https://www.technologyreview.com/feed/",
    category: "TECHNOLOGY",
    sourceReliability: "general_web",
  },
  {
    name: "IEEE Spectrum",
    url: "https://spectrum.ieee.org/feeds/feed.rss",
    category: "ENGINEERING",
    sourceReliability: "general_web",
  },
];

const REQUEST_HEADERS = {
  "user-agent": "HelixSignalFeed/1.0 (+https://github.com/infosloption-byte/video-director)",
  accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
};

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

function stripHtml(value = "") {
  return decodeXml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function readLink(block) {
  const rssLink = block.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i);
  if (rssLink) return decodeXml(rssLink[1]);

  const atomLink = block.match(/<link\s[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return atomLink ? decodeXml(atomLink[1]) : "";
}

function parseFeed(xml, feed) {
  const itemBlocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi)].map((match) => match[0]);

  return itemBlocks
    .map((block) => {
      const title = stripHtml(readTag(block, "title"));
      const description = stripHtml(
        readTag(block, "description") ||
          readTag(block, "summary") ||
          readTag(block, "content") ||
          readTag(block, "content:encoded"),
      );
      const url = readLink(block);
      const publishedAt =
        readTag(block, "pubDate") ||
        readTag(block, "published") ||
        readTag(block, "updated");

      if (!title || !url) return null;

      return {
        title,
        description: description.slice(0, 4000),
        sourceUrl: url,
        sourceName: feed.name,
        sourceType: "rss",
        sourceReliability: feed.sourceReliability,
        category: inferCategory(`${feed.category} ${title} ${description}`),
        publishedAt: parseDate(publishedAt),
        rawContent: description.slice(0, 12000),
      };
    })
    .filter(Boolean);
}

function parseDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function inferCategory(text = "") {
  const value = text.toLowerCase();
  const rules = [
    ["AI", /\b(ai|artificial intelligence|machine learning|neural network|llm|robot|robotics)\b/],
    ["PHYSICS", /\b(physics|quantum|particle|photon|atom|superconduct|gravity|laser)\b/],
    ["SPACE", /\b(space|nasa|astronomy|astronom|planet|exoplanet|star|galaxy|telescope|orbit)\b/],
    ["BIOTECH", /\b(biotech|biology|biological|gene|genome|cell|protein|crispr|embryo|medicine)\b/],
    ["ENERGY", /\b(battery|energy|solar|nuclear|fusion|hydrogen|grid|fuel|electric vehicle)\b/],
    ["CLIMATE", /\b(climate|warming|carbon|emission|environment|ecology|biodiversity)\b/],
    ["HARDWARE", /\b(chip|semiconductor|hardware|processor|sensor|computer|device|cooling)\b/],
  ];

  for (const [category, pattern] of rules) {
    if (pattern.test(value)) return category;
  }

  return "TECHNOLOGY";
}

async function fetchFeed(feed) {
  const response = await fetch(feed.url, { headers: REQUEST_HEADERS, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${feed.name} returned HTTP ${response.status}`);
  const xml = await response.text();
  return parseFeed(xml, feed);
}

export async function scrapeRssFeeds() {
  const results = await Promise.allSettled(RSS_FEEDS.map(fetchFeed));
  const items = [];

  results.forEach((result, index) => {
    const feed = RSS_FEEDS[index];
    if (result.status === "fulfilled") {
      console.log(`[signals] RSS ${feed.name}: ${result.value.length} items`);
      items.push(...result.value);
    } else {
      console.warn(`[signals] RSS ${feed.name} failed: ${result.reason?.message || result.reason}`);
    }
  });

  return items;
}
