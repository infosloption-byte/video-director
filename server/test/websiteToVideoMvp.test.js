import test from "node:test";
import assert from "node:assert/strict";
import { isPublicIp, normalizeWebsiteUrl, safeInternalUrl, robotsAllowed } from "../src/services/websiteSafeFetch.js";
import { analyzeWebsite, extractWebsitePage, assembleWebsiteReport } from "../src/services/websiteAnalysisService.js";

test("website URLs accept public HTTP(S) hostnames only", () => {
  assert.equal(normalizeWebsiteUrl("https://example.org/#x").href, "https://example.org/");
  for (const url of [
    "file:///etc/passwd", "javascript:alert(1)", "http://localhost/",
    "http://127.0.0.1", "http://[::1]/", "http://169.254.169.254/latest/meta-data",
    "https://user:pass@example.org/", "https://example.org:8080/",
    "http://secret.internal", "http://server.local", "https://www.example.org@localhost/"
  ]) assert.throws(() => normalizeWebsiteUrl(url));
});

test("private, special-use and IPv4-mapped hosts are not public targets", () => {
  for (const ip of [
    "10.0.0.1", "172.16.1.5", "192.168.1.1", "127.0.0.1",
    "100.64.12.1", "169.254.169.254", "198.18.0.1",
    "192.0.2.10", "198.51.100.4", "203.0.113.8", "224.0.0.1",
    "fc00::1", "fe80::1", "::ffff:10.0.0.1", "2001:db8::1",
  ]) assert.equal(isPublicIp(ip), false, ip);
  assert.equal(isPublicIp("8.8.8.8"), true);
  assert.equal(isPublicIp("2001:4860:4860::8888"), true);
});

test("navigation remains within the same allowed website and excludes private routes", () => {
  const site = new URL("https://example.org");
  assert.equal(safeInternalUrl("/products/?ref=ad#buy", site), "https://example.org/products/");
  for (const href of [
    "https://evil.example.net/", "https://example.org@127.0.0.1/",
    "javascript:alert(1)", "/account", "/checkout", "/api/data", "/image.png",
    "http://example.org/path",
  ]) assert.equal(safeInternalUrl(href, site), null, href);
});

test("robots rules respect disallow paths and allow exceptions", () => {
  const robots = "User-agent: *\nDisallow: /private\nAllow: /private/public\n";
  assert.equal(robotsAllowed("/products", robots), true);
  assert.equal(robotsAllowed("/private/members", robots), false);
  assert.equal(robotsAllowed("/private/public/info", robots), true);
});

test("website parser collects source-linked products, prices and public offers", () => {
  const page = extractWebsitePage(
    "<html><head><title>Products - Sample</title><meta name='description' content='Example business'/></head>" +
    "<body><h1>Products</h1><p>Our standard plan costs USD 29 per month.</p>" +
    "<p>Special offer: save 20% this week. Terms apply.</p><a href='/services'>Services</a></body></html>",
    "https://shop.example.org/products"
  );
  assert.equal(page.category, "product");
  assert.equal(page.description, "Example business");
  assert.ok(page.prices.some(x => x.includes("29")));
  assert.equal(page.offers.length, 1);
  const report = assembleWebsiteReport("https://shop.example.org/", [page]);
  assert.equal(report.products.length, 1);
  assert.equal(report.products[0].sourceUrl, page.url);
  assert.ok(report.videoIdeas.some(x => x.id === "product-showcase"));
  assert.ok(report.videoIdeas.some(x => x.id === "verified-offer"));
  assert.ok(report.videoIdeas.every(x => x.evidenceUrls.length));
});

test("the bounded website scan respects robots and produces no offers without evidence", async () => {
  const origin = "https://shop.example.org";
  const pages = {
    [origin + "/robots.txt"]: { status: 200, type: "text/plain", text: "User-agent: *\nDisallow: /hidden" },
    [origin + "/"]: { status: 200, type: "text/html", text:
      "<h1>Example Business</h1><p>We build scheduling tools for local companies.</p>" +
      "<a href='/services'>Service</a><a href='/hidden'>Private</a>" },
    [origin + "/services"]: { status: 200, type: "text/html", text:
      "<title>Services</title><h1>Scheduling Service</h1><p>Online booking and reminder scheduling for clients.</p>" },
  };
  let blocked = false;
  const fetchPage = async url => {
    if (url === origin + "/sitemap.xml") throw new Error("Website returned HTTP 404.");
    if (url.endsWith("/hidden")) blocked = true;
    const page = pages[url];
    if (!page) throw new Error("not found");
    return { ...page, url };
  };
  const report = await analyzeWebsite(origin + "/", { fetchPage });
  assert.equal(report.pagesScanned, 2);
  assert.equal(blocked, false);
  assert.equal(report.offers.length, 0);
  assert.equal(report.services.length, 1);
  assert.ok(report.videoIdeas.some(x => x.id === "service-explainer"));
  assert.ok(!report.videoIdeas.some(x => x.id === "verified-offer"));
});

test("API and storyboard routing remain distinct from Signals/Own Topic", async () => {
  const { readFile } = await import("node:fs/promises");
  const base = new URL("../src/", import.meta.url);
  const app = await readFile(new URL("app.js", base), "utf8");
  const prompts = await readFile(new URL("services/storyboardService.js", base), "utf8");
  const routes = await readFile(new URL("routes/websiteAnalyses.js", base), "utf8");
  assert.match(app, /\/api\/website-analyses", requireAuth, expensiveOperationRateLimit/);
  assert.match(app, /\/api\/research-conversations"/);
  assert.match(prompts, /signal\.category === "WEBSITE_MARKETING"/);
  assert.match(routes, /userId: req\.user\.id|userId = req\.user\.id/);
  assert.match(routes, /persistResearchGraph/);
});
