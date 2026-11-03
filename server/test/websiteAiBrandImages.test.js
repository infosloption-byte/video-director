import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import {
  WEBSITE_IMAGE_MODEL, isMarketingAiImagesEnabled, imageModelFromEnv, marketingVisualPrompt,
  detectImageFormat, readGeminiImage, generateWebsiteAiImage, imageHttpFailureCode,
} from "../src/services/websiteAiImageService.js";
import { createWebsiteMarketingVisual, marketingImageAvailable } from "../src/services/websiteMarketingVisualService.js";
import { brandSceneImagePath } from "../src/services/websiteBrandedVisualService.js";

const siteUrl="https://www.coderra.com.au/";
const productUrl=siteUrl+"products/commops";
const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0,0]);
const campaign={
  brandName:"Coderra", analysisUrl:siteUrl, sourceUrls:[productUrl],
  sourceFacts:[{url:productUrl,detail:"CommOps helps businesses follow up on published SMS conversations."}],
  focus:"CommOps", cta:"Visit Coderra's website",
};
const kit={version:1,brandName:"Coderra",palette:{background:"#1A1D2A",accent:"#DD3355",text:"#FFFFFF"},assets:[]};
const plan={scenePurpose:"feature",sourceImageUrl:null,sourcePageUrl:productUrl};
const scene={title:"Product conversation support",spokenText:"CommOps supports ongoing messaging."};
const enabled={VOXORA_MARKETING_AI_IMAGES_ENABLED:"true",GEMINI_API_KEY:"test-secret"};

test("AI image mode is opt-in, paid and requires an existing provider key",()=>{
  assert.equal(isMarketingAiImagesEnabled({GEMINI_API_KEY:"x"}),false);
  assert.equal(isMarketingAiImagesEnabled({VOXORA_MARKETING_AI_IMAGES_ENABLED:"true"}),false);
  assert.equal(marketingImageAvailable({}).enabled,false);
  assert.equal(marketingImageAvailable(enabled).enabled,true);
  assert.equal(imageModelFromEnv(enabled),WEBSITE_IMAGE_MODEL);
  assert.throws(()=>imageModelFromEnv({...enabled,VOXORA_MARKETING_IMAGE_MODEL:"unknown-model"}),/Unsupported/);
});
test("prompts use brand facts and visual safe zones, never request generated logos/text/claims",()=>{
  const p=marketingVisualPrompt({campaign,brandKit:kit,scene,plan});
  assert.match(p,/Coderra/);
  assert.match(p,/CommOps/);
  assert.match(p,/#DD3355/);
  assert.match(p,/lower 30 percent/);
  assert.match(p,/DO NOT include any readable text/);
  assert.match(p,/invented app screens/);
  assert.match(p,/untrusted/);
  assert.ok(!p.includes("https://169.254"));
});
test("provider image bytes must match MIME and be safely bounded",()=>{
  assert.equal(detectImageFormat(png,"image/png").extension,"png");
  assert.throws(()=>detectImageFormat(png,"image/jpeg"),/invalid or mismatched/);
  assert.throws(()=>detectImageFormat(Buffer.alloc(8*1024*1024+1),"image/png"),/size/);
  assert.throws(()=>readGeminiImage({candidates:[{content:{parts:[{text:"No image"}]}}]}),/no image/);
  const image=readGeminiImage({candidates:[{content:{parts:[{inlineData:{
    mimeType:"image/png", data:png.toString("base64"),
  }}]}}]});
  assert.equal(image.extension,"png");
});
test("Gemini request is only sent with explicit enablement and uses vertical image-only generation",async()=>{
  const calls=[];
  const generated=await generateWebsiteAiImage({
    campaign,brandKit:kit,scene,plan,env:enabled,
    fetchFn:async(url,opts)=>{
      calls.push({url,opts});
      return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify({candidates:[{content:{parts:[{inlineData:{
        mimeType:"image/png",data:png.toString("base64"),
      }}]}}]})};
    },
  });
  assert.equal(generated.provider,"gemini");
  assert.equal(generated.model,WEBSITE_IMAGE_MODEL);
  assert.equal(calls.length,1);
  assert.equal(calls[0].opts.headers["x-goog-api-key"],"test-secret");
  assert.ok(!calls[0].url.includes("test-secret"));
  const body=JSON.parse(calls[0].opts.body);
  assert.deepEqual(body.generationConfig.responseModalities,["IMAGE"]);
  assert.equal(body.generationConfig.imageConfig.aspectRatio,"9:16");
  assert.equal(body.generationConfig.imageConfig.imageSize,"1K");
  assert.match(body.contents[0].parts[0].text,/No branded logo recreation/);
  await assert.rejects(generateWebsiteAiImage({
    campaign,brandKit:kit,scene,plan,env:{},
    fetchFn:async()=>{throw new Error("network should not be called");},
  }),/not enabled/);
});
test("one AI scene writes only authenticated PNG and preserves provider provenance without Pexels",async()=>{
  const projectId=crypto.randomUUID(),sceneId=crypto.randomUUID();
  const project={id:projectId,userId:"u",signal:{category:"WEBSITE_MARKETING"},
    researchSources:{websiteMarketing:campaign}};
  const pathname=brandSceneImagePath(projectId,sceneId);
  const traces=[];
  try{
    const result=await createWebsiteMarketingVisual({
      project,sceneId,scene,sceneIndex:1,sceneCount:3,visualMode:"ai",
      brandKit:kit,env:enabled,
      aiGenerate:async()=>({bytes:png,extension:"png",model:WEBSITE_IMAGE_MODEL}),
      trace:async(meta,work)=>{traces.push(meta);return work();},
      runCommand:async(name,args)=>{
        if(name==="ffprobe")return {stdout:JSON.stringify({streams:[{width:768,height:1376}]})};
        await writeFile(args.at(-1),png);return {stdout:""};
      },
    });
    assert.equal(result.visualPlan.visualSource,"gemini_generated_illustration");
    assert.equal(result.visualPlan.aiStatus,"generated");
    assert.equal(result.visualPlan.stockUsed,false);
    assert.equal(traces[0].operation,"storyboard.website_ai_image");
    assert.equal((await readFile(pathname))[0],137);
    assert.match(result.videoUrl,/\/api\/render-assets\/.*\.png\?v=/);
  }finally{await rm(pathname,{force:true});}
});
test("provider failure yields a transparent branded fallback, without retrying stock providers",async()=>{
  const projectId=crypto.randomUUID(),sceneId=crypto.randomUUID();
  const project={id:projectId,userId:"u",signal:{category:"WEBSITE_MARKETING"},
    researchSources:{websiteMarketing:campaign}};
  let fallbackCount=0;
  const result=await createWebsiteMarketingVisual({
    project,sceneId,scene,visualMode:"ai",brandKit:kit,env:enabled,
    aiGenerate:async()=>{const err=new Error("provider 429");err.code="IMAGE_RATE_LIMITED";throw err;},
    trace:async(_meta,work)=>work(),
    brandGenerate:async()=>{fallbackCount++;return {videoUrl:"/local.png",visualPlan:{visualMode:"branded_composition",stockUsed:false}};},
  });
  assert.equal(fallbackCount,1);
  assert.equal(result.visualPlan.aiStatus,"fallback");
  assert.equal(result.visualPlan.aiFallbackCode,"IMAGE_RATE_LIMITED");
  assert.equal(result.visualPlan.stockUsed,false);
  await assert.rejects(createWebsiteMarketingVisual({
    project,sceneId,scene,visualMode:"ai",brandKit:kit,env:{},
  }),/not enabled/);
});
test("website API offers AI scene images only explicitly, with server feature gate and no paid bulk surprises",async()=>{
  const source=await readFile(new URL("../src/routes/storyboard.js",import.meta.url),"utf8");
  assert.match(source,/router\.get\("\/marketing-visuals\/status"/);
  assert.match(source,/visualMode = req\.body\?\.visualMode === "ai"/);
  assert.match(source,/createWebsiteMarketingVisual/);
  assert.match(source,/AI_IMAGES_DISABLED/);
  const bulk=source.slice(source.indexOf('router.post("/projects/:id/regenerate-brand-visuals"'),
    source.indexOf('router.post("/scenes/:sceneId/regenerate-assets"'));
  assert.doesNotMatch(bulk,/createWebsiteMarketingVisual/);
});
test("FFmpeg brand fallback does not embed duplicate headings, CTAs or subtitles",async()=>{
  const source=await readFile(new URL("../src/services/websiteBrandedVisualService.js",import.meta.url),"utf8");
  assert.doesNotMatch(source,/font\(texts\[/);
  assert.doesNotMatch(source,/drawtext=/);
  assert.match(source,/rendered ONCE by Remotion/);
});


test("billable AI image request budget is shared across distinct scenes",async()=>{
  const { expensiveOperationRateLimit } = await import("../src/middleware/rateLimit.js");
  const before=process.env.MARKETING_AI_IMAGE_RATE_LIMIT;
  process.env.MARKETING_AI_IMAGE_RATE_LIMIT="3";
  const userId=crypto.randomUUID();
  try{
    for(let i=0;i<4;i++){
      const req={
        path:"/scenes/"+crypto.randomUUID()+"/regenerate-assets",
        method:"POST",body:{visualMode:"ai"},
        user:{id:userId},headers:{},ip:"127.0.0.1",
      };
      let status=null, next=false;
      const res={
        setHeader(){},
        status(value){status=value;return this;},
        json(){return this;},
      };
      expensiveOperationRateLimit(req,res,()=>{next=true;});
      if(i<3)assert.equal(next,true,"the first three paid calls are allowed");
      else assert.equal(status,429,"fourth request across another scene is rate limited");
    }
  }finally{
    if(before==null)delete process.env.MARKETING_AI_IMAGE_RATE_LIMIT;
    else process.env.MARKETING_AI_IMAGE_RATE_LIMIT=before;
  }
});


test("Gemini API errors retain safe actionable codes for auth, model, quota and provider downtime", async () => {
  const cases = [[400,"IMAGE_REQUEST_REJECTED"],[401,"IMAGE_INVALID_API_KEY"],
    [403,"IMAGE_ACCESS_DENIED"],[404,"IMAGE_MODEL_UNAVAILABLE"],
    [429,"IMAGE_RATE_LIMITED"],[503,"IMAGE_PROVIDER_UNAVAILABLE"]];
  for (const [status, expected] of cases) {
    assert.equal(imageHttpFailureCode(status), expected);
    await assert.rejects(generateWebsiteAiImage({
      campaign,brandKit:kit,scene,plan,env:enabled,
      fetchFn:async()=>({ok:false,status,headers:{get:()=>null}}),
    }), error => error.code === expected && error.httpStatus === status);
  }
});

test("an image-only Gemini reply without an image reports a distinct empty-output reason", async () => {
  await assert.rejects(generateWebsiteAiImage({
    campaign,brandKit:kit,scene,plan,env:enabled,
    fetchFn:async()=>({
      ok:true,headers:{get:()=>null},
      text:async()=>JSON.stringify({candidates:[{content:{parts:[{text:"Unable to generate"}]}}]}),
    }),
  }), error => error.code === "IMAGE_EMPTY_OUTPUT");
});

test("website scene response provides generated-vs-basic-vs-fallback state to the UI", async () => {
  const source=await readFile(new URL("../src/routes/storyboard.js",import.meta.url),"utf8");
  assert.match(source,/visualOutcome:\s*\{/);
  assert.match(source,/requestedMode:/);
  assert.match(source,/failureCode: reportedPlan\?\.aiFallbackCode/);
});
