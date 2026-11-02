// Presentation-only enhancement for persisted website snapshots.
// Keep the raw extracted passages and citation URLs intact: marketing claims
// must still come from the original business-published source pages.

function text(value, limit = 350) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}
export function cleanWebsiteHeading(value, limit = 180) {
  const tokens = text(value, 600).split(/\s+/).filter(Boolean);
  const result = [];
  for (const token of tokens) {
    const normalized = token.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    const previous = (result[result.length - 1] || "").toLowerCase()
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (normalized && normalized === previous) continue;
    result.push(token);
  }
  return result.join(" ").slice(0, limit);
}
export function websiteBrandLabel(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "");
    // Extract the brand label, including for country-code public suffixes
    // such as coderra.com.au, without guessing about the business's industry.
    const label = host.split(".")[0].replace(/[-_]+/g, " ");
    return label.replace(/\b\p{L}/gu, character => character.toUpperCase()).slice(0, 80) || host;
  } catch { return "Website"; }
}
function sourcePage(report, url) {
  return (Array.isArray(report?.pages) ? report.pages : []).find(p => p?.url === url);
}
function evidenceUrls(report, rows, max = 5) {
  const allowed = new Set((report?.pages || []).map(page => page.url));
  return [...new Set(rows.map(row => typeof row === "string" ? row : row?.sourceUrl).filter(url => allowed.has(url)))].slice(0, max);
}
function itemTitle(item, fallback) {
  const candidate = cleanWebsiteHeading(item?.title || "", 100);
  return candidate && candidate.length < 95 ? candidate : fallback;
}
function compactFact(page, fallback = "") {
  const candidates = [page?.description, ...(page?.highlights || []), page?.textPreview];
  return text(candidates.find(value => typeof value === "string" && value.trim().length > 16) || fallback, 400);
}
function buildVideoIdea(report, original, brand, category) {
  const hostname = new URL(report.url).hostname;
  const pages = report.pages || [];
  const types = {
    "company-introduction": {
      title: brand + " — Business introduction",
      hook: "Discover " + brand,
      angle: "Introduce " + brand + " using its published business overview, offerings and website messaging.",
      focus: brand,
      audience: "People discovering the business",
      sources: [report.url, ...(report.about || []).map(x => x.sourceUrl)],
    },
    "product-showcase": {
      title: "Product spotlight",
      hook: "Explore a product from " + brand,
      angle: "Present one listed product, explaining its published features without adding unsupported benefits.",
      focus: itemTitle(report.products?.[0], "Product"),
      audience: "Visitors evaluating this product",
      sources: (report.products || []).map(x => x.sourceUrl),
    },
    "service-explainer": {
      title: "Service explainer",
      hook: "Explore a service from " + brand,
      angle: "Explain a listed service, what the business says it provides, and how visitors can enquire.",
      focus: itemTitle(report.services?.[0], "Service"),
      audience: "Visitors considering this service",
      sources: (report.services || []).map(x => x.sourceUrl),
    },
    "verified-offer": {
      title: "Published offer spotlight",
      hook: "Explore a published offer from " + brand,
      angle: "Describe a listed promotion only when its terms are clear and currently applicable; otherwise request review before advertising.",
      focus: text(report.offers?.[0]?.text, 160),
      audience: "Visitors interested in the listed offer",
      sources: (report.offers || []).map(x => x.sourceUrl),
    },
    "common-questions": {
      title: "Website FAQ explainer",
      hook: "Questions about " + brand + "?",
      angle: "Answer questions using only published FAQ information and an appropriate website CTA.",
      focus: text(report.faq?.[0]?.text, 120),
      audience: "Visitors looking for more information",
      sources: (report.faq || []).map(x => x.sourceUrl),
    },
  };
  const template = types[original.id];
  if (!template) return original;
  const urls = evidenceUrls(report, template.sources).length
    ? evidenceUrls(report, template.sources) : evidenceUrls(report, original.evidenceUrls || []);
  const focus = cleanWebsiteHeading(template.focus, 110);
  const focused = ["product-showcase", "service-explainer"].includes(original.id) &&
    focus && !["Product", "Service"].includes(focus);
  const title = focused ? focus + (original.id === "product-showcase" ? " — Product video" : " — Service video") : template.title;
  const firstPage = sourcePage(report, urls[0]) || pages[0] || {};
  return {
    ...original,
    title: title.slice(0, 135),
    hook: template.hook,
    angle: template.angle,
    audience: template.audience,
    focus: focus || brand,
    cta: "Learn more at " + hostname,
    sourceFacts: urls.map(url => {
      const page = sourcePage(report, url);
      return { url, detail: compactFact(page) };
    }).filter(row => row.detail).slice(0, 5),
    evidenceUrls: urls,
  };
}
export function refineWebsiteReport(raw) {
  if (!raw || typeof raw !== "object" || !raw.url) return raw;
  const pages = Array.isArray(raw.pages) ? raw.pages : [];
  const name = websiteBrandLabel(raw.url);
  const siteName = cleanWebsiteHeading(pages[0]?.siteName || "", 90);
  const brand = siteName && siteName.split(/\s+/).length <= 5 ? siteName : name;
  const selectedDescription = text(raw.description || raw.summary, 500);
  return {
    ...raw,
    originalHeading: cleanWebsiteHeading(raw.name || "", 200),
    name: brand,
    description: selectedDescription,
    summary: text(raw.summary || selectedDescription, 550),
    pages: pages.map(page => ({
      ...page,
      title: cleanWebsiteHeading(page.title || "", 180),
      headings: (page.headings || []).map(h => cleanWebsiteHeading(h, 180)),
    })),
    products: (raw.products || []).map(x => ({ ...x, title: cleanWebsiteHeading(x.title, 140) })),
    services: (raw.services || []).map(x => ({ ...x, title: cleanWebsiteHeading(x.title, 140) })),
    about: (raw.about || []).map(x => ({ ...x, title: cleanWebsiteHeading(x.title, 140) })),
    videoIdeas: (raw.videoIdeas || []).map(idea => buildVideoIdea({ ...raw, pages }, idea, brand)),
  };
}
