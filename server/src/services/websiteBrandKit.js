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
      background: colors[0] || fallback.background,
      accent: colors[1] || fallback.accent,
      text: fallback.text,
    },
    paletteSource: colors.length ? "website_meta_theme_color" : "neutral_fallback_not_verified",
    assets,
    visualSourcePolicy: "website_brand_first",
    allowStock: false,
    brandAssetsRequireRightsApproval: true,
  };
}
export function planWebsiteSceneVisual({ campaign, brandKit, scene, sceneIndex = 0, sceneCount = 1, variant = 0 }) {
  const sourceUrls = campaign?.sourceUrls || [];
  const preferredPage = sourceUrls[sceneIndex % Math.max(1, sourceUrls.length)] || campaign?.analysisUrl || brandKit?.websiteUrl;
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
    brandName: campaign?.brandName || brandKit?.brandName || "Business",
    headline: String(scene?.title || campaign?.focus || "").slice(0, 140),
    palette: brandKit?.palette || fallback,
    paletteSource: brandKit?.paletteSource || "neutral_fallback_not_verified",
    stockUsed: false,
    rightsReviewRequired: Boolean(best),
    variant,
  };
}
