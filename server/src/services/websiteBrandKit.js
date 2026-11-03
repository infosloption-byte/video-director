// Site-owned assets for marketing visuals. This is an observed public-site
// identity snapshot, NOT a license to reproduce logos or product imagery.
function websiteBrandLabel(siteUrl) {
  const first = new URL(siteUrl).hostname.replace(/^www\./i, "").split(".")[0];
  return first.replace(/[-_]+/g, " ").replace(/\b[a-z]/g, value => value.toUpperCase());
}

const fallback = { background: "#14232E", accent: "#50D4B5", text: "#FFFFFF" };
const unique = arr => [...new Set(arr.filter(Boolean))];
export function normalizeBrandColor(value) {
  const hex = String(value || "").trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!hex) return null;
  return "#" + (hex.length === 3 ? [...hex].map(x => x + x).join("") : hex).toUpperCase();
}
export function siteImageUrl(url, siteUrl) {
  try {
    const u = new URL(url, siteUrl);
    const site = new URL(siteUrl);
    const canonical = host => host.replace(/^www\./i, "").toLowerCase();
    if (u.protocol !== "https:" || canonical(u.hostname) !== canonical(site.hostname) ||
      u.username || u.password || u.port || !/\.(?:jpe?g|png|webp)$/i.test(u.pathname) ||
      /\/(?:api|admin|account|checkout|private|login|logout)\//i.test(u.pathname)) return null;
    u.hash = "";
    return u.href;
  } catch { return null; }
}
function imageRole(url) {
  const name = new URL(url).pathname.toLowerCase();
  return /logo|brand|mark/.test(name) ? "logo"
    : /product|dashboard|screenshot|interface|app|screen|feature/.test(name) ? "product"
    : /hero|banner|cover/.test(name) ? "hero" : "website_image";
}
export function createWebsiteBrandKit(report) {
  const pages = Array.isArray(report?.pages) ? report.pages : [];
  const url = report?.url;
  if (!url) return null;
  const colors = unique(pages.map(page => normalizeBrandColor(page.brandColor)));
  const luminance = color => {
    const value = String(color || "").replace("#", "");
    return (0.2126 * parseInt(value.slice(0, 2), 16) +
      0.7152 * parseInt(value.slice(2, 4), 16) +
      0.0722 * parseInt(value.slice(4, 6), 16)) / 255;
  };
  const hasDarkTheme = colors.length && luminance(colors[0]) < 0.54;
  const assets = [];
  const seen = new Set();
  for (const page of pages) {
    for (const candidate of (page.images || []).slice(0, 12)) {
      const safe = siteImageUrl(candidate, url);
      if (!safe || seen.has(safe)) continue;
      seen.add(safe);
      assets.push({ url: safe, sourcePageUrl: page.url, role: imageRole(safe) });
      if (assets.length >= 40) break;
    }
    if (assets.length >= 40) break;
  }
  const logo = assets.find(asset => asset.role === "logo");
  return {
    version: 1,
    brandName: report.name && report.name.length < 80 ? report.name : websiteBrandLabel(url),
    websiteUrl: url,
    logoUrl: logo?.url || null,
    palette: {
      background: hasDarkTheme ? colors[0] : fallback.background,
      accent: colors.find(color => luminance(color) > 0.28 && luminance(color) < 0.88) || fallback.accent,
      text: fallback.text,
    },
    paletteSource: colors.length ? "website_meta_theme_color" : "neutral_fallback_not_verified",
    assets,
    visualSourcePolicy: "website_brand_first",
    allowStock: false,
    brandAssetsRequireRightsApproval: true,
  };
}
// Choose evidence pages by what a scene actually discusses, instead of
// blindly cycling unrelated product screenshots through the storyboard.
const IGNORED_SCENE_WORDS = new Set([
  "about", "brand", "business", "company", "customer", "customers", "feature",
  "features", "helps", "more", "product", "products", "service", "services",
  "their", "these", "this", "those", "through", "using", "website", "where",
  "which", "with", "your", "from", "have", "will", "visit", "learn",
]);
function sceneWords(value) {
  return new Set((String(value || "").toLowerCase().match(/[a-z0-9]{4,}/g) || [])
    .filter(word => !IGNORED_SCENE_WORDS.has(word)));
}
function imageSourceMatchScore(url, sceneTerms, sourceFacts) {
  let pathWords = [];
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean).slice(-2);
    pathWords = [...sceneWords(segments.join(" ").replace(/[-_]/g, " "))];
  } catch { /* invalid source receives no match score */ }
  const slugMatches = pathWords.filter(word => sceneTerms.has(word)).length;
  const facts = sourceFacts.filter(fact => fact?.url === url);
  const factWords = sceneWords(facts.map(fact => String(fact.detail || "").slice(0, 300)).join(" "));
  const factMatches = [...factWords].filter(word => sceneTerms.has(word)).length;
  return slugMatches * 5 + Math.min(3, factMatches);
}
function relevantSourcePage(campaign, scene, sceneIndex) {
  const sources = Array.isArray(campaign?.sourceUrls) ? campaign.sourceUrls.filter(Boolean) : [];
  if (!sources.length) return campaign?.analysisUrl || null;
  if (sources.length === 1) return sources[0];
  const facts = Array.isArray(campaign?.sourceFacts) ? campaign.sourceFacts : [];
  const text = [scene?.title, scene?.spoken_text, scene?.spokenText,
    scene?.broll_search_term, scene?.brollSearchTerm].filter(Boolean).join(" ");
  const terms = sceneWords(text);
  const ranked = sources.map((url, index) => ({ url, index,
    score: imageSourceMatchScore(url, terms, facts),
  })).sort((a,b) => b.score - a.score || a.index - b.index);
  if (ranked[0].score > 0) return ranked[0].url;
  // A generic intro/CTA can still reflect the campaign's named focus.
  const focusTerms = sceneWords(campaign?.focus || "");
  const focused = sources.map((url,index) => ({url,index,
    score: imageSourceMatchScore(url, focusTerms, facts),
  })).sort((a,b) => b.score - a.score || a.index - b.index);
  return focused[0].score > 0 ? focused[0].url : sources[sceneIndex % sources.length];
}

export function planWebsiteSceneVisual({ campaign, brandKit, scene, sceneIndex = 0, sceneCount = 1, variant = 0 }) {
  const sourceUrls = campaign?.sourceUrls || [];
  const preferredPage = relevantSourcePage(campaign, scene, sceneIndex) || brandKit?.websiteUrl;
  const assets = (brandKit?.assets || []).filter(asset => sourceUrls.includes(asset.sourcePageUrl));
  const best = assets.find(asset => asset.sourcePageUrl === preferredPage && asset.role === "product")
    || assets.find(asset => asset.role === "product")
    || assets.find(asset => asset.sourcePageUrl === preferredPage)
    || assets[variant % Math.max(1, assets.length)]
    || (brandKit?.assets || []).find(asset => asset.role === "logo")
    || null;
  const purpose = sceneIndex === 0 ? "hook" : sceneIndex >= sceneCount - 1 ? "cta" : "feature";
  return {
    scenePurpose: purpose,
    visualMode: "branded_composition",
    visualSource: best ? "website_image_and_branded_layout" : "generated_branded_layout",
    focusSourceUrl: best?.sourcePageUrl || preferredPage || null,
    sourceImageUrl: best?.url || null,
    sourceImageRole: best?.role || null,
    brandName: campaign?.brandName || brandKit?.brandName || "Business",
    headline: String(scene?.title || campaign?.focus || "").slice(0, 140),
    palette: brandKit?.palette || fallback,
    paletteSource: brandKit?.paletteSource || "neutral_fallback_not_verified",
    stockUsed: false,
    rightsReviewRequired: Boolean(best),
    variant,
    sceneIndex,
    sceneCount,
  };
}
