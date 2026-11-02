import test from "node:test";
import assert from "node:assert/strict";
import { refineWebsiteReport, cleanWebsiteHeading, websiteBrandLabel } from "../src/services/websiteReportQuality.js";
import { buildWebsiteBrief } from "../src/services/websiteCampaignService.js";
import { extractWebsitePage } from "../src/services/websiteAnalysisService.js";

const coderraUrl = "https://www.coderra.com.au/";
function sampleReport() {
  return {
    url: coderraUrl,
    name: "When someone asks ChatGPT ChatGPT who who is the best best physio physio in Brisbane Brisbane, are you the answer?",
    description: "Coderra helps businesses appear when customers ask AI.",
    summary: "Coderra helps businesses appear when customers ask AI.",
    pages: [
      { url: coderraUrl, title: "Coderra - AI visibility", headings: ["When someone asks ChatGPT ChatGPT who who"], description: "Coderra helps businesses appear when customers ask AI.", textPreview: "Public website information about Coderra." },
      { url: coderraUrl + "about", title: "About Coderra", headings: ["About"], description: "Australian AI-search visibility business.", textPreview: "AISO and CommOps help businesses communicate." },
      { url: coderraUrl + "products/aiso", title: "AISO", headings: ["AISO"], description: "AISO is a published product focused on AI search visibility.", textPreview: "AISO product information." },
      { url: coderraUrl + "services/research", title: "Service research", headings: ["Marketing research"], description: "Published research service details.", textPreview: "Research service details." },
    ],
    products: [{ title: "AISO AISO", description: "AI search product.", sourceUrl: coderraUrl + "products/aiso", highlights: ["AISO"] }],
    services: [{ title: "Research research service", description: "Research service.", sourceUrl: coderraUrl + "services/research", highlights: ["Research"] }],
    about: [{ title: "About us", sourceUrl: coderraUrl + "about" }],
    offers: [],
    faq: [],
    videoIdeas: [
      { id: "company-introduction", title: "Business introduction", evidenceUrls: [coderraUrl, coderraUrl + "about"], durationSeconds: 30 },
      { id: "product-showcase", title: "Product showcase", evidenceUrls: [coderraUrl + "products/aiso"], durationSeconds: 30 },
      { id: "service-explainer", title: "Service explainer", evidenceUrls: [coderraUrl + "services/research"], durationSeconds: 30 },
    ],
  };
}
test("saved Coderra report displays business identity, not repeated homepage H1", () => {
  assert.equal(cleanWebsiteHeading("ChatGPT ChatGPT who who is is the best best"), "ChatGPT who is the best");
  assert.equal(websiteBrandLabel(coderraUrl), "Coderra");
  const report = refineWebsiteReport(sampleReport());
  assert.equal(report.name, "Coderra");
  assert.match(report.originalHeading, /When someone asks ChatGPT who is the best physio in Brisbane/);
  assert.equal(report.pages[0].headings[0], "When someone asks ChatGPT who");
  assert.equal(report.summary, "Coderra helps businesses appear when customers ask AI.");
});
test("captured OG site name takes precedence over domain when reasonably short", () => {
  const page = extractWebsitePage(
    '<html><head><title>Newest offer</title><meta property="og:site_name" content="North Star Crafts"></head><body><h1>Offer</h1></body></html>',
    "https://shop.northstarcrafts.com/products"
  );
  assert.equal(page.siteName, "North Star Crafts");
  const report = sampleReport();
  report.pages[0].siteName = "Coderra";
  assert.equal(refineWebsiteReport(report).name, "Coderra");
});
test("suggested concepts are specific to scanned offerings without manufactured promotions", () => {
  const result = refineWebsiteReport(sampleReport());
  assert.equal(result.videoIdeas.length, 3);
  assert.equal(result.videoIdeas.some(x => x.id === "verified-offer"), false);
  const product = result.videoIdeas.find(x => x.id === "product-showcase");
  const service = result.videoIdeas.find(x => x.id === "service-explainer");
  assert.match(product.title, /AISO/);
  assert.match(service.title, /Research service/);
  assert.ok(product.evidenceUrls.every(url => result.pages.some(p => p.url === url)));
  assert.ok(product.sourceFacts.some(x => x.detail.includes("AISO")));
  assert.ok(product.hook && product.cta && product.audience);
});
test("selected website concept creates a complete and narrowly sourced research brief", () => {
  const report = refineWebsiteReport(sampleReport());
  const idea = report.videoIdeas.find(x => x.id === "product-showcase");
  const brief = buildWebsiteBrief(report, idea);
  assert.equal(brief.websiteMarketing.ideaId, "product-showcase");
  assert.equal(brief.websiteMarketing.brandName, "Coderra");
  assert.equal(brief.websiteMarketing.focus, "AISO");
  assert.equal(brief.websiteMarketing.audience, idea.audience);
  assert.equal(brief.websiteMarketing.cta, idea.cta);
  assert.deepEqual(brief.websiteMarketing.sourceUrls, [coderraUrl + "products/aiso"]);
  assert.equal(brief.sources.length, 1);
  assert.equal(brief.sources[0].url, coderraUrl + "products/aiso");
  assert.equal(brief.verification.claims[0].verification_status, "website_sourced");
  assert.match(brief.executive_summary, /Selected marketing video/);
  assert.doesNotMatch(brief.executive_summary, /When someone asks ChatGPT ChatGPT/);
});
test("website campaign handoff refuses concepts with no readable supporting sources", () => {
  const report = refineWebsiteReport(sampleReport());
  assert.throws(() => buildWebsiteBrief(report, { id: "untrusted", evidenceUrls: ["https://another-website.com/"] }), /no readable website sources/);
});
test("normal research and setup remain routed independently of marketing", async () => {
  const { readFile } = await import("node:fs/promises");
  const root = new URL("../src/", import.meta.url);
  const router = await readFile(new URL("routes/websiteAnalyses.js", root), "utf8");
  const storyboard = await readFile(new URL("services/storyboardService.js", root), "utf8");
  assert.match(router, /refineWebsiteReport\(item\.report\)/);
  assert.match(router, /buildWebsiteBrief\(report, idea\)/);
  assert.match(router, /\/storyboard\/.*stage=setup/);
  assert.match(storyboard, /signal\.category === "WEBSITE_MARKETING"/);
  assert.match(storyboard, /sourceFacts: campaign\.sourceFacts/);
});
