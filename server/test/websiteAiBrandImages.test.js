import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import {
  WEBSITE_IMAGE_MODEL, isMarketingAiImagesEnabled, imageModelFromEnv, marketingVisualPrompt,
  marketingVisualSubject, detectImageFormat, readGeminiImage, generateWebsiteAiImage,
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
test("AI scene prompts keep one brand style but vary focal composition and cite only matching product facts",()=>{
  const secondProduct=siteUrl+"products/aiso";
  const twoProductCampaign={...campaign,
    sourceUrls:[productUrl,secondProduct],
    sourceFacts:[
      campaign.sourceFacts[0],
      {url:secondProduct,detail:"AISO supports a distinct search-content product."},
    ],
  };
  const hook=marketingVisualPrompt({campaign:twoProductCampaign,brandKit:kit,scene,plan:{
    ...plan,scenePurpose:"hook",focusSourceUrl:productUrl,sceneIndex:0,
  }});
  const feature=marketingVisualPrompt({campaign:twoProductCampaign,brandKit:kit,scene,plan:{
    ...plan,scenePurpose:"feature",focusSourceUrl:productUrl,sceneIndex:2,
  }});
  const closing=marketingVisualPrompt({campaign:twoProductCampaign,brandKit:kit,scene,plan:{
    ...plan,scenePurpose:"cta",focusSourceUrl:productUrl,sceneIndex:3,
  }});
  assert.match(hook,/Opening hero frame/);
  assert.match(feature,/Specific composition for this cut/);
  assert.match(closing,/Closing frame/);
  assert.notEqual(hook,feature);
  assert.notEqual(feature,closing);
  for(const prompt of [hook,feature,closing]){
    assert.match(prompt,/SAME palette/);
    assert.match(prompt,/CommOps helps businesses/);
    assert.doesNotMatch(prompt,/AISO supports a distinct/);
    assert.match(prompt,/DO NOT include any readable text/);
  }
});

test("marketing prompts describe concrete software and AI subjects instead of abstract rectangles",()=>{
  const softwareScene={title:"Key Services",spokenText:
    "They deliver custom software, web and mobile apps, SaaS platforms and practical AI."};
  const subject=marketingVisualSubject({scene:softwareScene,campaign});
  assert.match(subject,/software team/);
  assert.match(subject,/laptop, smartphone and tablet/);
  const prompt=marketingVisualPrompt({campaign,brandKit:kit,scene:softwareScene,plan});
  assert.match(prompt,/Required visual subject for this cut/);
  assert.match(prompt,/NEVER output an abstract layout/);
  assert.match(prompt,/realistic proportions/);
  assert.match(prompt,/lower 30 percent/);
  assert.match(prompt,/DO NOT include any readable text/);
  assert.doesNotMatch(prompt,/AISO supports a distinct search-content product/);
  const aiSubject=marketingVisualSubject({scene:{title:"Practical AI",spokenText:"AI-powered automation"},campaign:{focus:""}});
  assert.match(aiSubject,/human-led technology workflow/);
});
test("capability status exposes the configured image model but not a provider secret",()=>{
  const result=marketingImageAvailable(enabled);
  assert.equal(result.enabled,true);
  assert.equal(result.model,WEBSITE_IMAGE_MODEL);
  assert.ok(!JSON.stringify(result).includes("test-secret"));
  assert.equal(marketingImageAvailable({...enabled,VOXORA_MARKETING_IMAGE_MODEL:"not-a-real-model"}).enabled,false);
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
test("Gemini HTTP failures return safe codes instead of opaque successful image fallbacks",async()=>{
  for (const [httpStatus,code] of [
    [400,"IMAGE_PROVIDER_REJECTED"],
    [401,"IMAGE_AUTH_FAILED"],
    [403,"IMAGE_AUTH_FAILED"],
    [404,"IMAGE_MODEL_UNAVAILABLE"],
    [429,"IMAGE_RATE_LIMITED"],
    [503,"IMAGE_PROVIDER_ERROR"],
  ]) {
    await assert.rejects(generateWebsiteAiImage({
      campaign,brandKit:kit,scene,plan,env:enabled,
      fetchFn:async()=>({ok:false,status:httpStatus}),
    }),error=>error.code===code && error.httpStatus===httpStatus);
  }
});
test("Gemini malformed responses distinguish invalid JSON from no generated image",async()=>{
  for (const [body,code] of [
    ["not-json","IMAGE_INVALID_RESPONSE"],
    [JSON.stringify({candidates:[{content:{parts:[{text:"No output"}]}}]}),"IMAGE_NO_OUTPUT"],
  ]) {
    await assert.rejects(generateWebsiteAiImage({
      campaign,brandKit:kit,scene,plan,env:enabled,
      fetchFn:async()=>({ok:true,headers:{get:()=>null},text:async()=>body}),
    }),error=>error.code===code);
  }
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
        await writeFile(args.at(-1),Buffer.concat([png,Buffer.alloc(2048)]));return {stdout:""};
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
test("AI output quality gates reject wrong aspect ratio and corrupt converted PNG without claiming AI success",async()=>{
  const projectId=crypto.randomUUID(),sceneId=crypto.randomUUID();
  const project={id:projectId,userId:"u",signal:{category:"WEBSITE_MARKETING"},
    researchSources:{websiteMarketing:campaign}};
  let fallbackCalls=0,ffmpegCalls=0;
  for (const [width,height,writeCorrupt,reason] of [
    [1280,720,false,"BAD_IMAGE_ASPECT_RATIO"],
    [768,1376,true,"BAD_IMAGE_OUTPUT"],
  ]) {
    const result=await createWebsiteMarketingVisual({
      project,sceneId,scene,visualMode:"ai",brandKit:kit,env:enabled,
      aiGenerate:async()=>({bytes:png,extension:"png",model:WEBSITE_IMAGE_MODEL}),
      trace:async(_meta,work)=>work(),
      runCommand:async(name,args)=>{
        if(name==="ffprobe")return {stdout:JSON.stringify({streams:[{width,height}]})};
        ffmpegCalls++;
        await writeFile(args.at(-1),Buffer.alloc(2048));
        return {stdout:""};
      },
      brandGenerate:async()=>{fallbackCalls++;return {videoUrl:"/local.png",
        visualPlan:{visualMode:"branded_composition",stockUsed:false}};},
    });
    assert.equal(result.visualPlan.aiStatus,"fallback");
    assert.equal(result.visualPlan.aiFallbackCode,reason);
  }
  assert.equal(ffmpegCalls,1,"off-ratio images never reach FFmpeg conversion");
  assert.equal(fallbackCalls,2);
});

test("AI provider never receives a company logo as its visual reference",async()=>{
  const projectId=crypto.randomUUID(),sceneId=crypto.randomUUID();
  const project={id:projectId,userId:"u",signal:{category:"WEBSITE_MARKETING"},
    researchSources:{websiteMarketing:campaign}};
  const logoKit={...kit,assets:[{
    url:siteUrl+"assets/logo.png",sourcePageUrl:productUrl,role:"logo",
  }]};
  let imageFetchCount=0, referenceImage=null;
  const result=await createWebsiteMarketingVisual({
    project,sceneId,scene,visualMode:"ai",brandKit:logoKit,env:enabled,
    imageFetch:async()=>{imageFetchCount++;throw new Error("logo should not be fetched");},
    aiGenerate:async(opts)=>{referenceImage=opts.referenceImage;throw Object.assign(new Error("mock provider unavailable"),{code:"IMAGE_RATE_LIMITED"});},
    trace:async(_meta,work)=>work(),
    brandGenerate:async()=>({videoUrl:"/local.png",visualPlan:{stockUsed:false}}),
  });
  assert.equal(result.visualPlan.aiStatus,"fallback");
  assert.equal(imageFetchCount,0);
  assert.equal(referenceImage,null);
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
  assert.equal(result.visualPlan.imageProvider,"gemini");
  assert.equal(result.visualPlan.imageModel,WEBSITE_IMAGE_MODEL);
  assert.equal(result.visualPlan.aiFallbackCode,"IMAGE_RATE_LIMITED");
  assert.equal(result.visualPlan.stockUsed,false);
  await assert.rejects(createWebsiteMarketingVisual({
    project,sceneId,scene,visualMode:"ai",brandKit:kit,env:{},
  }),/not enabled/);
});
test("explicit AI failure preserves the existing scene without producing a fallback image",async()=>{
  const projectId=crypto.randomUUID(),sceneId=crypto.randomUUID();
  const project={id:projectId,userId:"u",signal:{category:"WEBSITE_MARKETING"},
    researchSources:{websiteMarketing:campaign}};
  let fallbackCalls=0;
  await assert.rejects(createWebsiteMarketingVisual({
    project,sceneId,scene,visualMode:"ai",brandKit:kit,env:enabled,
    fallbackOnAiFailure:false,
    aiGenerate:async()=>{throw Object.assign(new Error("mock rejected"),{
      code:"IMAGE_AUTH_FAILED",httpStatus:403,
    });},
    trace:async(_meta,work)=>work(),
    brandGenerate:async()=>{fallbackCalls++;return {videoUrl:"/local.png"};},
  }),error=>error.code==="IMAGE_AUTH_FAILED" && error.httpStatus===403 &&
    /existing scene visual was preserved/.test(error.message));
  assert.equal(fallbackCalls,0,"paid AI failure must not replace a previous scene image");
});
test("scene route refuses fallback for explicit Gemini calls and reports safe failure codes",async()=>{
  const source=await readFile(new URL("../src/routes/storyboard.js",import.meta.url),"utf8");
  const handler=source.slice(source.indexOf('router.post("/scenes/:sceneId/regenerate-assets"'),
    source.indexOf("// Repair only missing narration;"));
  assert.match(handler,/fallbackOnAiFailure: false/);
  assert.match(handler,/safeCode === "IMAGE_RATE_LIMITED" \? 429 : 502/);
  assert.match(handler,/previous scene image was preserved/);
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
