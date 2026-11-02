import test from "node:test";
import assert from "node:assert/strict";
import {
  isPublicIp, normalizeWebsiteUrl, safeInternalUrl, robotsAllowed,
} from "../src/services/websiteSafeFetch.js";
import {
  extractWebsitePage, assembleWebsiteReport, analyzeWebsite,
} from "../src/services/websiteAnalysisService.js";

test("website research blocks loopback/private metadata networks and unsafe ports", () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.2.3", "192.168.1.1",
    "169.254.169.254", "100.64.0.1", "198.18.0.1", "203.0.113.1"]) {
    assert.equal(isPublicIp(ip), false, ip);
  }
  assert.equal(isPublicIp("8.8.8.8"), true);
  for (const value of ["http://localhost", "https://127.0.0.1", "http://example.local",
    "file:///etc/passwd", "http://www.example.com:8080/", "https://u:p@mycompany.com"]) {
    assert.throws(() => normalizeWebsiteUrl(value), /public|URL|ports/, value);
  }
  assert.equal(normalizeWebsiteUrl("https://mycompany.com/start#secret").hash, "");
});

test("crawl navigation stays on public same-origin HTML pages", () => {
  const base = normalizeWebsiteUrl("https://mycompany.com/");
  assert.equal(safeInternalUrl("/products?a=tracking", base), "https://mycompany.com/products");
  for (const link of ["http://mycompany.com/", "https://elsewhere.com/",
    "/admin", "/checkout", "javascript:alert(1)", "/app.js"]) {
    assert.equal(safeInternalUrl(link, base), null, link);
  }
  assert.equal(robotsAllowed("/private/data", "User-agent: *\nDisallow: /private\n"), false);
  assert.equal(robotsAllowed("/public", "User-agent: *\nDisallow: /private\n"), true);
});

test("page extraction identifies public pages, products, offers, contacts and citations", () => {
  const html = '<html><head><title>Example Cloud Apps</title><meta name="description" content="Business cloud tools"></head>' +
    '<body><h1>CRM Software</h1><p>Customer relationship management software for small teams.</p>' +
    '<p>Starter price $49 per month.</p><p>Contact sales@smallteam-crm.test for a demonstration.</p><p>Ignore example placeholder: sales@example.org.</p>' +
    '<a href="/services">Services</a><img src="/product.jpg"></body></html>';
  const page = extractWebsitePage(html, "https://business.test.invalid/products/crm");
  assert.equal(page.category, "product");
  assert.ok(page.prices.some(value => value.startsWith("$49")));
  assert.ok(page.emails.includes("sales@smallteam-crm.test"), "Realistic business contact must be extracted");
  assert.ok(!page.emails.includes("sales@example.org"), "Documentation placeholder addresses must be ignored");
  assert.ok(page.links.includes("/services"));
  const report = assembleWebsiteReport("https://business.test.invalid/", [page]);
  assert.equal(report.pagesScanned, 1);
  assert.ok(report.contacts.emails.includes("sales@smallteam-crm.test"));
  assert.equal(report.products.length, 1);
  assert.ok(report.products[0].sourceUrl.endsWith("/products/crm"));
  assert.ok(report.videoIdeas.some(x => x.id === "product-showcase"));
  assert.equal(report.offers.length, 0, "A public price is not automatically a discount");
});

test("bounded analysis respects disallow rules and never fetches blocked link", async () => {
  const calls = [];
  const html = '<html><head><title>Sample Store</title></head><body>' +
    '<h1>Sample Store</h1><p>We create hand-crafted reusable products for home kitchens.</p>' +
    '<a href="/products">Products</a><a href="/account">Account</a></body></html>';
  const fakeFetch = async url => {
    calls.push(url);
    if (url.endsWith("/robots.txt")) return { status: 200, type: "text/plain", text: "User-agent: *\nDisallow: /products\n", url };
    if (url.endsWith("/sitemap.xml")) throw new Error("HTTP 404");
    return { status: 200, type: "text/html", text: html, url };
  };
  const report = await analyzeWebsite("https://shop.example.com", { fetchPage: fakeFetch });
  assert.equal(report.pagesScanned, 1);
  assert.equal(calls.some(url => url.includes("/products")), false);
  assert.equal(calls.some(url => url.includes("/account")), false);
  assert.equal(report.url, "https://shop.example.com/");
});
