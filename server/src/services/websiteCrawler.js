import { normalizeWebsiteUrl, safeInternalUrl, fetchPublicPage, robotsAllowed } from "./websiteSafeFetch.js";

const MAX_PAGES = 12;
const MAX_TEXT_PER_PAGE = 3200;
const ENTITY = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—", copy: "©", rsquo: "’", ldquo: "“", rdquo: "”" };
export function decodeHtml(raw = "") {
  return String(raw).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (full, value) => {
    if (value.startsWith("#")) {
      const num = value[1]?.toLowerCase() === "x" ? parseInt(value.slice(2), 16) : parseInt(value.slice(1), 10);
      return Number.isInteger(num) && num > 0 && num <= 0x10ffff && !(num >= 0xd800 && num <= 0xdfff) ? String.fromCodePoint(num) : "";
    }
    return ENTITY[value.toLowerCase()] ?? full;
  });
}
function strip(raw) {
  return decodeHtml(String(raw).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim();
}
function attribute(attrs, name) {
  const pattern = new RegExp("(?:^|\\s)" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i");
  const match = String(attrs).match(pattern);
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? "");
}
function meta(html, field, value) {
  for (const [, attrs] of html.matchAll(/<meta\b([^>]+)>/gi)) {
    if (attribute(attrs, field).toLowerCase() === value) return attribute(attrs, "content");
  }
  return "";
}
function unique(items, limit = 20) {
  return [...new Set(items.map(x => String(x || "").trim()).filter(Boolean))].slice(0, limit);
}
function redactSensitive(text) {
  // Do not persist phone numbers or email content from form input fields.
  return text.replace(/\b(?:password|secret|token|api[_ -]?key)\s*[:=]\s*\S+/gi, "[redacted]");
}
export function extractWebsitePage(html, url, site) {
  const cleanHtml = String(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|svg|iframe|form|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(input|textarea|button|select)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const title = strip(cleanHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const description = meta(cleanHtml, "name", "description") || meta(cleanHtml, "property", "og:description");
  const headings = unique([...cleanHtml.matchAll(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/gi)].map(m => strip(m[1])), 16);
  const links = [];
  const imageUrls = [];
  for (const [, attrs] of cleanHtml.matchAll(/<a\b([^>]+)>/gi)) {
    const href = attribute(attrs, "href");
    const link = safeInternalUrl(href, site);
    if (link) links.push(link);
  }
  for (const [, attrs] of cleanHtml.matchAll(/<img\b([^>]+)>/gi)) {
    const src = attribute(attrs, "src");
    const alt = attribute(attrs, "alt");
    try {
      const resolved = new URL(src, site);
      if (resolved.protocol === "https:" && resolved.hostname === site.hostname && !resolved.username && !resolved.password) {
        imageUrls.push({ url: resolved.href, alt: alt.slice(0, 120) });
      }
    } catch { /* ignore invalid image references */ }
  }
  const text = redactSensitive(
    decodeHtml(cleanHtml.replace(/<(br|\/p|\/li|\/h[1-6]|\/section|\/article|\/div)>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n")).trim()
  ).slice(0, MAX_TEXT_PER_PAGE);
  const emails = unique([...(text.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi))].map(m => m[0]), 8);
  return { url, title: title.slice(0, 180), description: description.slice(0, 400),
    headings, text, emails, images: imageUrls.slice(0, 10), links: unique(links, 70) };
}
function priority(url) {
  const path = new URL(url).pathname.toLowerCase();
  if (/contact|service|product|shop|pricing|offer|promotion|about|team|faq|solution|feature/.test(path)) return 0;
  return 1;
}
export async function crawlWebsite(rawUrl, { onProgress, maxPages = MAX_PAGES, signal } = {}) {
  const site = normalizeWebsiteUrl(rawUrl);
  const boundedMax = Math.min(MAX_PAGES, Math.max(1, Number(maxPages) || MAX_PAGES));
  const robotsUrl = new URL("/robots.txt", site).href;
  let robots = "";
  try {
    const fetched = await fetchPublicPage(robotsUrl, { signal });
    if (/text\/plain|text\/html|application\/octet-stream/i.test(fetched.type)) robots = fetched.text.slice(0, 50_000);
  } catch (e) {
    // Explicitly stop if robots.txt is forbidden. A missing robots file is normal.
    if (/HTTP (401|403)/.test(String(e?.message))) throw new Error("The website does not permit automated inspection.");
    if (!/HTTP 404/.test(String(e?.message))) throw new Error("Unable to verify the website's robots.txt policy.");
  }
  const queue = [site.href]; const visited = new Set(); const pages = []; const errors = [];
  onProgress?.(8, "Checking public website access");
  while (queue.length && pages.length < boundedMax) {
    queue.sort((a, b) => priority(a) - priority(b));
    const next = queue.shift();
    if (visited.has(next)) continue;
    visited.add(next);
    if (!robotsAllowed(new URL(next).pathname, robots)) continue;
    try {
      const result = await fetchPublicPage(next, { signal });
      if (!/text\/html|application\/xhtml\+xml/i.test(result.type)) continue;
      const page = extractWebsitePage(result.text, result.url, site);
      if (!page.text && !page.description) continue;
      pages.push({ id: "page-" + (pages.length + 1), ...page });
      onProgress?.(10 + Math.round(pages.length / boundedMax * 58),
        "Reading website pages (" + pages.length + "/" + boundedMax + ")");
      for (const link of page.links) {
        if (!visited.has(link) && !queue.includes(link) && queue.length < 90) queue.push(link);
      }
    } catch (error) {
      errors.push({ url: next, error: String(error?.message || "Page unavailable").slice(0, 120) });
    }
  }
  if (!pages.length) throw new Error("No readable public pages were found. Check the URL and website access policy.");
  return { rootUrl: site.origin, submittedUrl: site.href, pages, errors: errors.slice(0, 12),
    scannedAt: new Date().toISOString(), maxPages: boundedMax, partial: queue.length > 0 || errors.length > 0 };
}
