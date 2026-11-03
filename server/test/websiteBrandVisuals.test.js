import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile, writeFile, rm } from "node:fs/promises";
import { createWebsiteBrandKit, siteImageUrl, normalizeBrandColor, planWebsiteSceneVisual } from "../src/services/websiteBrandKit.js";
import { brandSceneImagePath, brandSceneImageUrl, isBrandStillUrl, createWebsiteBrandedVisual } from "../src/services/websiteBrandedVisualService.js";
import { refineWebsiteReport } from "../src/services/websiteReportQuality.js";
import { buildWebsiteBrief } from "../src/services/websiteCampaignService.js";

const url = "https://www.coderra.com.au/";
const product = url + "products/commops";
function report() {
  return {
    url, name: "Coderra",
    summary: "A business providing outreach tools.",
    pages: [
      { url, title: "Coderra", brandColor: "#163", images: [url + "assets/brand-logo.png"] },
      { url: product, title: "CommOps", images: [url + "images/commops-dashboard.png", "https://169.254.169.254/evil.png"] },
      { url: url + "products/aiso", title: "AISO", images: [url + "images/aiso.png"] },
    ],
    products: [{title:"CommOps", sourceUrl:product}],
    services: [], about:[], offers: [], faq:[],
    videoIdeas: [{id:"product-showcase",title:"Product showcase",evidenceUrls:[product],durationSeconds:30}],
  };
}
test("brand kit is constrained to real same-website images and no-stock policy", () => {
  assert.equal(normalizeBrandColor("#163"), "#116633");
  assert.equal(normalizeBrandColor("#112233"), "#112233".toUpperCase());
  assert.equal(normalizeBrandColor("red;background:url(foo)"), null);
  assert.equal(siteImageUrl("https://169.254.169.254/private.png", url), null);
  assert.equal(siteImageUrl("https://cdn.example.com/images/logo.png", url), null);
  assert.equal(siteImageUrl(url + "admin/settings.png", url), null);
  assert.equal(siteImageUrl(url + "assets/brand.svg", url), null);
  const kit = createWebsiteBrandKit(report());
  assert.equal(kit.brandName, "Coderra");
  assert.equal(kit.palette.background, "#116633");
  assert.equal(kit.paletteSource, "website_meta_theme_color");
  assert.equal(kit.allowStock, false);
  assert.equal(kit.visualSourcePolicy, "website_brand_first");
  assert.equal(kit.assets.length, 3);
  assert.equal(kit.logoUrl, url + "assets/brand-logo.png");
});
test("old reports gain brand kit without re-running website research", () => {
  const previous = report();
  delete previous.brandKit;
  const refined = refineWebsiteReport(previous);
  assert.equal(refined.brandKit.brandName, "Coderra");
  assert.equal(refined.brandKit.assets.length, 3);
  const idea = refined.videoIdeas[0];
  const brief = buildWebsiteBrief(refined, idea);
  assert.equal(brief.websiteMarketing.allowStock, false);
  assert.equal(brief.websiteMarketing.brandKit.logoUrl, url + "assets/brand-logo.png");
});
test("scene artwork uses selected product page assets, never another product or Pexels", () => {
  const kit = createWebsiteBrandKit(report());
  const plan = planWebsiteSceneVisual({
    campaign: {brandName:"Coderra",sourceUrls:[product],analysisUrl:url},
    brandKit:kit, scene:{title:"Customer replies with CommOps"},sceneIndex:0,sceneCount:4,
  });
  assert.equal(plan.sourceImageUrl, url + "images/commops-dashboard.png");
  assert.equal(plan.focusSourceUrl, product);
  assert.equal(plan.stockUsed, false);
  assert.equal(plan.rightsReviewRequired, true);
  assert.equal(plan.scenePurpose, "hook");
});
test("brand-only fallback uses actual brand label and generated layout without stock", () => {
  const kit=createWebsiteBrandKit({url,name:"Coderra",pages:[]});
  const plan=planWebsiteSceneVisual({campaign:{brandName:"Coderra",sourceUrls:[product]},brandKit:kit,scene:{title:"Features"},sceneIndex:2,sceneCount:4});
  assert.equal(plan.sourceImageUrl,null);
  assert.equal(plan.visualSource,"generated_branded_layout");
  assert.equal(plan.paletteSource,"neutral_fallback_not_verified");
  assert.equal(plan.stockUsed,false);
});
test("branded scene asset URLs are limited to the exact project and scene", () => {
  const p=crypto.randomUUID(), s=crypto.randomUUID();
  assert.ok(brandSceneImagePath(p,s).endsWith(s+".png"));
  assert.equal(isBrandStillUrl(brandSceneImageUrl(p,s,123),p,s),true);
  assert.equal(isBrandStillUrl("/api/render-assets/"+p+"/scenes/other.png",p,s),false);
  assert.throws(()=>brandSceneImagePath("../internal",s),/Invalid/);
});
test("local branded artwork creation preserves the source policy when a website image fails", async () => {
  const p=crypto.randomUUID(),s=crypto.randomUUID();
  const kit=createWebsiteBrandKit(report());
  const project={id:p,userId:"test-user",signal:{category:"WEBSITE_MARKETING"},
    researchSources:{websiteMarketing:{brandName:"Coderra",analysisUrl:url,sourceUrls:[product],focus:"CommOps",cta:"Learn more at coderra.com.au"}}};
  try {
    const generated=await createWebsiteBrandedVisual({
      project,sceneId:s,scene:{title:"CommOps sends helpful replies"},
      sceneIndex:1,sceneCount:4,brandKit:kit,
      loadImage:async()=>{throw new Error("image unavailable");},
      runFfmpeg:async(_name,args)=>{
        // Stub the FFmpeg process without requiring external media in the unit suite.
        await writeFile(args.at(-1), Buffer.from([137,80,78,71,13,10,26,10]));
      },
    });
    assert.match(generated.videoUrl,/\/api\/render-assets\/.+\.png\?v=/);
    assert.equal(generated.visualPlan.visualSource,"generated_branded_layout");
    assert.equal(generated.visualPlan.stockUsed,false);
    const contents=await readFile(brandSceneImagePath(p,s));
    assert.equal(contents[0],137);
  } finally { await rm(brandSceneImagePath(p,s),{force:true}); }
});
test("both initial storyboard and scene regeneration branch on website marketing", async () => {
  const path = new URL("../src/routes/storyboard.js",import.meta.url);
  const source=await readFile(path,"utf8");
  assert.match(source,/project\.signal\?\.category === "WEBSITE_MARKETING"/);
  assert.match(source,/createWebsiteBrandedVisual/);
  assert.match(source,/sceneVisualPlan/);
  assert.match(source,/searchPexelsVideos/); // still available for normal research only
  assert.match(source,/const isMarketing = scene\.project\.signal\?\.category === "WEBSITE_MARKETING"/);
});
test("rendering uses local brand still with Remotion Img, and normal stock retains OffthreadVideo", async () => {
  const root = new URL("../src/",import.meta.url);
  const render = await readFile(new URL("services/renderAssetService.js",root),"utf8");
  const service = await readFile(new URL("services/renderService.js",root),"utf8");
  const comp = await readFile(new URL("remotion/Composition.jsx",root),"utf8");
  assert.match(render,/isBrandStillUrl/);
  assert.match(service,/imageUrl: isBrandStill/);
  assert.match(comp,/<Img src=\{selectedAsset\.imageUrl\}/);
  assert.match(comp,/<OffthreadVideo/);
  assert.match(comp,/scene\.brandName \|\| "HELIX"/);
});
