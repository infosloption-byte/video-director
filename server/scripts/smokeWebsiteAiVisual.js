// Run in an isolated test image to validate full PNG -> FFmpeg -> PNG path.
// Uses a local fake provider payload; NEVER calls Gemini or bills a customer.
// Usage: node scripts/smokeWebsiteAiVisual.js
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { createWebsiteBrandedVisual, brandSceneImagePath } from "../src/services/websiteBrandedVisualService.js";
import { createWebsiteMarketingVisual } from "../src/services/websiteMarketingVisualService.js";
import { createWebsiteBrandKit } from "../src/services/websiteBrandKit.js";

const id=crypto.randomUUID(), sourceId=crypto.randomUUID(), targetId=crypto.randomUUID();
const site="https://example-business.org/";
const campaign={type:"website_marketing",brandName:"Sample Business",analysisUrl:site,
  sourceUrls:[site+"products/demo"],sourceFacts:[{url:site+"products/demo",detail:"A sample public product."}],
  focus:"Sample Product",cta:"Visit the website"};
const project={id,userId:"smoke-local",signal:{category:"WEBSITE_MARKETING"},researchSources:{websiteMarketing:campaign}};
const kit=createWebsiteBrandKit({url:site,name:"Sample Business",pages:[]});
try{
  const source=await createWebsiteBrandedVisual({
    project,sceneId:sourceId,brandKit:kit,
    scene:{title:"Branded illustration"},sceneIndex:0,sceneCount:2,
  });
  const bytes=await readFile(brandSceneImagePath(id,sourceId));
  assert.ok(bytes.length>1000, "source must be a real PNG");
  const result=await createWebsiteMarketingVisual({
    project,sceneId:targetId,brandKit:kit,scene:{title:"Explore the sample product"},
    sceneCount:2,visualMode:"ai",
    env:{GEMINI_API_KEY:"smoke-fake",VOXORA_MARKETING_AI_IMAGES_ENABLED:"true"},
    aiGenerate:async()=>({bytes,extension:"png",model:"mock-local-image"}),
    trace:async(_metadata,task)=>task(),
  });
  assert.equal(result.visualPlan.visualMode,"ai_generated_background");
  assert.equal(result.visualPlan.aiStatus,"generated");
  assert.equal(result.visualPlan.stockUsed,false);
  const output=await readFile(brandSceneImagePath(id,targetId));
  assert.ok(output.length>1000);
  assert.ok(output.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
  console.log("AI_IMAGE_TO_BRANDED_PNG_PIPELINE_OK",output.length,"bytes");
  console.log("LOCAL_FFMPEG_ONLY_NO_PROVIDER_CALLS");
} finally {
  await Promise.allSettled([sourceId,targetId].map(sceneId=>rm(brandSceneImagePath(id,sceneId),{force:true})));
}
