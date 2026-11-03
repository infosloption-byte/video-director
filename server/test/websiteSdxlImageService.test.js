import test from "node:test";
import assert from "node:assert/strict";
import {
  SDXL_MODEL, sdxlApiConfig, isSdxlImageEnabled, sdxlScenePrompt,
  submitSdxlSceneImage, getSdxlSceneImageStatus, getSdxlSceneImageArtifact,
} from "../src/services/websiteSdxlImageService.js";
import { marketingImageAvailable } from "../src/services/websiteMarketingVisualService.js";

const id="0123456789abcdef0123456789abcdef";
const env={
  VOXORA_MARKETING_AI_IMAGES_ENABLED:"true",
  VOXORA_MARKETING_IMAGE_PROVIDER:"sdxl_local",
  VOXORA_SDXL_ENABLED:"true",
  VOXORA_SDXL_API_URL:"https://gpu.internal.example",
  VOXORA_SDXL_API_TOKEN:"test-private-token-".repeat(3),
};
function json(body,status=200) {
  return {ok:status>=200&&status<300,status,
    headers:{get:()=>null},text:async()=>JSON.stringify(body)};
}

test("SDXL is selected only with explicit private GPU credentials and both feature flags",()=>{
  assert.equal(marketingImageAvailable(env).provider,"sdxl_local");
  assert.equal(marketingImageAvailable(env).model,SDXL_MODEL);
  assert.equal(marketingImageAvailable(env).paid,false);
  assert.equal(marketingImageAvailable(env).enabled,true);
  assert.equal(isSdxlImageEnabled({...env,VOXORA_SDXL_ENABLED:"false"}),false);
  assert.equal(isSdxlImageEnabled({...env,VOXORA_MARKETING_AI_IMAGES_ENABLED:"false"}),false);
  assert.equal(isSdxlImageEnabled({...env,VOXORA_SDXL_API_TOKEN:""}),false);
  assert.deepEqual(sdxlApiConfig(env),{baseUrl:"https://gpu.internal.example",token:env.VOXORA_SDXL_API_TOKEN});
});

test("SDXL rejects remote plaintext, URLs with credentials and unnecessary paths",()=>{
  for(const url of [
    "http://172.31.64.234:8010",
    "http://example.com:8010",
    "https://user:password@gpu.example.com",
    "https://gpu.example.com/unsafe/path",
    "https://gpu.example.com/?token=secret",
    "file:///tmp/sock",
  ]) {
    assert.throws(()=>sdxlApiConfig({...env,VOXORA_SDXL_API_URL:url}),
      error=>error.code==="SDXL_NOT_CONFIGURED");
  }
  assert.equal(sdxlApiConfig({...env,VOXORA_SDXL_API_URL:"http://127.0.0.1:18010"}).baseUrl,
    "http://127.0.0.1:18010");
});

test("SDXL scene prompts are short, visual and reject fabricated UI",()=>{
  const prompt=sdxlScenePrompt({
    campaign:{focus:"Software and platform engineering"},
    brandKit:{palette:{background:"#122334",accent:"#abcdef"}},
    scene:{title:"Custom apps",spokenText:"Our team builds mobile and web applications"},
    plan:{scenePurpose:"hook"},
  });
  assert.ok(prompt.length>=12&&prompt.length<=1200);
  assert.match(prompt,/photographic image/);
  assert.match(prompt,/software team/);
  assert.match(prompt,/No letters, text/);
});

test("SDXL queue submission includes no secret in URL or response and uses bearer auth",async()=>{
  const calls=[];
  const job=await submitSdxlSceneImage({
    campaign:{focus:"Software engineering"},brandKit:{},
    scene:{title:"Mobile apps"},plan:{scenePurpose:"feature"},env,
    fetchFn:async(url,options)=>{
      calls.push({url,options});
      return json({id,kind:"image",status:"queued"});
    },
  });
  assert.deepEqual(job,{jobId:id,status:"queued"});
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,"https://gpu.internal.example/v1/jobs");
  assert.equal(calls[0].options.method,"POST");
  assert.equal(calls[0].options.redirect,"manual");
  assert.equal(calls[0].options.headers.Authorization,"Bearer "+env.VOXORA_SDXL_API_TOKEN);
  const body=JSON.parse(calls[0].options.body);
  assert.equal(body.kind,"image");
  assert.ok(body.negative_prompt.length<300);
  assert.ok(body.prompt.length<=1200);
  assert.ok(!JSON.stringify(job).includes(env.VOXORA_SDXL_API_TOKEN));
});

test("SDXL polling handles queued, completed, failed and malformed jobs",async()=>{
  const queued=await getSdxlSceneImageStatus(id,{env,fetchFn:async()=>json({
    id,kind:"image",status:"started",progress:43,
  })});
  assert.deepEqual(queued,{jobId:id,status:"started",progress:43});
  const done=await getSdxlSceneImageStatus(id,{env,fetchFn:async()=>json({
    id,kind:"image",status:"finished",result:{engine:SDXL_MODEL,width:576,height:1024},
  })});
  assert.equal(done.status,"finished");
  await assert.rejects(getSdxlSceneImageStatus(id,{env,fetchFn:async()=>json({
    id,kind:"image",status:"failed",error:"Secret backend log details",
  })}),error=>error.code==="SDXL_JOB_FAILED"&&!error.message.includes("Secret"));
  await assert.rejects(getSdxlSceneImageStatus(id,{env,fetchFn:async()=>json({
    id,kind:"video",status:"finished",result:{engine:SDXL_MODEL,width:576,height:1024},
  })}),error=>error.code==="SDXL_INVALID_RESPONSE");
  await assert.rejects(getSdxlSceneImageStatus("not-an-id",{env,fetchFn:async()=>{
    throw new Error("Should not call network");
  }}),error=>error.code==="SDXL_INVALID_RESPONSE");
});

test("SDXL image artifact is a bounded authenticated PNG",async()=>{
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(1500)]);
  const artifact=await getSdxlSceneImageArtifact(id,{env,fetchFn:async(url,opts)=>{
    assert.equal(url,"https://gpu.internal.example/v1/jobs/"+id+"/artifact");
    assert.equal(opts.redirect,"manual");
    return {ok:true,headers:{get:()=>null},arrayBuffer:async()=>png};
  }});
  assert.equal(artifact.model,SDXL_MODEL);
  assert.equal(artifact.provider,"sdxl_local");
  assert.deepEqual(artifact.bytes,png);
  await assert.rejects(getSdxlSceneImageArtifact(id,{env,fetchFn:async()=>({
    ok:true,headers:{get:()=>null},arrayBuffer:async()=>Buffer.alloc(1600),
  })}),error=>error.code==="SDXL_INVALID_OUTPUT");
});
