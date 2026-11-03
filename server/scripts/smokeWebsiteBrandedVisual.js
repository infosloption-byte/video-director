// Verify real FFmpeg branded PNG generation inside the isolated Voxora API
// image. No DB writes, external website fetches, TTS, or API container restart.
//   node scripts/smokeWebsiteBrandedVisual.js
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { createWebsiteBrandedVisual, brandSceneImagePath } from "../src/services/websiteBrandedVisualService.js";
import { createWebsiteBrandKit } from "../src/services/websiteBrandKit.js";

const projectId=crypto.randomUUID();
const sceneId=crypto.randomUUID();
const siteUrl="https://www.example-business.org/";
const project={
  id: projectId,
  userId: "smoke-only",
  signal: { category: "WEBSITE_MARKETING" },
  researchSources: { websiteMarketing: {
    type:"website_marketing", brandName:"Example Business",
    analysisUrl:siteUrl, sourceUrls:[siteUrl+"products/sample"],
    focus:"Published product", cta:"Learn more at the website",
  }},
};
const kit=createWebsiteBrandKit({url:siteUrl,name:"Example Business",pages:[]});
const output=brandSceneImagePath(projectId,sceneId);
try {
  const asset=await createWebsiteBrandedVisual({
    project,sceneId,brandKit:kit,
    scene:{title:"Explore the published product features"},
    sceneIndex:0,sceneCount:3,
  });
  assert.equal(asset.visualPlan.visualMode,"branded_composition");
  assert.equal(asset.visualPlan.stockUsed,false);
  const file=await readFile(output);
  assert.ok(file.length>3000,"FFmpeg must create substantial PNG pixel data");
  assert.ok(file.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),"Produced image must be a PNG");
  console.log("BRANDED_SCENE_PNG_CREATED",file.length,"bytes");
  console.log("NO_PEXELS_FALLBACK_VERIFIED");
}finally {
  await rm(output,{force:true});
}
