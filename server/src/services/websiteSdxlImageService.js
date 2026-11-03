// Private SDXL worker client for Website-to-Video. No GPU inference on
// Lightsail, no customer-supplied URLs, no redirects and no bearer tokens in
// browser responses or logs. GPU Media API stays bound to localhost on EC2;
// only a trusted encrypted tunnel or authenticated HTTPS proxy may connect it.
import { marketingVisualSubject } from "./websiteAiImageService.js";
import { detectImageFormat } from "./websiteAiImageService.js";

export const SDXL_MODEL = "sdxl-base-1.0";
const IMAGE_LIMIT = 8 * 1024 * 1024;
const JOB_ID = /^[0-9a-f]{32}$/;
const PENDING = new Set(["queued","started","deferred","scheduled"]);

function fail(code, status = null) {
  const error = new Error("Private SDXL image service unavailable.");
  error.code = code;
  if (Number.isInteger(status)) error.httpStatus = status;
  return error;
}
function clean(value, max) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g," ")
    .replace(/\s+/g," ").trim().slice(0,max);
}

export function sdxlApiConfig(env = process.env) {
  const raw = String(env.VOXORA_SDXL_API_URL || "").trim();
  const token = String(env.VOXORA_SDXL_API_TOKEN || "").trim();
  if (!raw || token.length < 32 || token.length > 512) throw fail("SDXL_NOT_CONFIGURED");
  let url;
  try { url = new URL(raw); } catch { throw fail("SDXL_NOT_CONFIGURED"); }
  const loopback = ["127.0.0.1","[::1]"].includes(url.hostname);
  if (!(url.protocol === "https:" || (url.protocol === "http:" && loopback)) ||
    url.username || url.password || url.search || url.hash ||
    (url.pathname !== "/" && url.pathname !== "") || !url.port && url.protocol !== "https:") {
    throw fail("SDXL_NOT_CONFIGURED");
  }
  return { baseUrl:url.origin, token };
}

export function isSdxlImageEnabled(env = process.env) {
  if (env.VOXORA_MARKETING_AI_IMAGES_ENABLED !== "true" ||
    env.VOXORA_SDXL_ENABLED !== "true") return false;
  try { sdxlApiConfig(env); return true; } catch { return false; }
}

export function sdxlScenePrompt({ campaign = {}, brandKit = {}, scene = {}, plan = {} }) {
  // CLIP text encoders have short context. Prioritize an identifiable subject,
  // shot composition and scene-specific service evidence over long marketing
  // explanations; avoid fake brand screens, claims, numbers or lettering.
  const title = clean(scene.title,90);
  const spoken = clean(scene.spoken_text || scene.spokenText,150);
  const palette = [brandKit.palette?.background,brandKit.palette?.accent]
    .filter(value => /^#[0-9a-f]{6}$/i.test(String(value))).slice(0,2).join(" and ");
  const subject = clean(marketingVisualSubject({scene,campaign}),330);
  const direction = plan.scenePurpose === "hook" ? "cinematic editorial opening"
    : plan.scenePurpose === "cta" ? "warm successful human outcome"
    : "authentic documentary commercial photo";
  return clean([
    direction + ", vertical portrait 9:16, high-quality photographic image.",
    subject,
    "Service: " + clean(campaign.focus || title,65) + ".",
    spoken ? "Scene: " + spoken + "." : "",
    palette ? "Subtle brand palette " + palette + "." : "",
    "Natural light, believable materials, vivid depth, premium film color, clear main subject in upper center, calm bottom third.",
    "No letters, text, logo, watermark, interface, abstract rectangles or fabricated dashboard.",
  ].filter(Boolean).join(" "),1100);
}

export const SDXL_NEGATIVE_PROMPT = "text, letters, words, watermark, logo, typography, interface, dashboard, abstract rectangles, flat color blocks, blurry, deformed hands, distorted faces, extra fingers, low quality";

function providerCode(status) {
  return status === 401 || status === 403 ? "SDXL_AUTH_FAILED"
    : status === 409 ? "SDXL_NOT_READY"
    : status === 429 ? "SDXL_QUEUE_FULL"
    : status === 404 ? "SDXL_JOB_MISSING"
    : "SDXL_UNAVAILABLE";
}

async function request(url, {method="GET",body=null,config,fetchFn=fetch,timeoutMs=12000}) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response = await fetchFn(url,{
      method, headers:{
        "Authorization":"Bearer "+config.token,
        ...(body ? {"Content-Type":"application/json"} : {}),
      },
      ...(body ? {body:JSON.stringify(body)} : {}),
      redirect:"manual",signal:controller.signal,
    });
    if (!response?.ok) throw fail(providerCode(Number(response?.status)),Number(response?.status));
    return response;
  } catch(error) {
    if (error?.code) throw error;
    throw fail(error?.name === "AbortError" ? "SDXL_TIMEOUT" : "SDXL_UNAVAILABLE");
  } finally { clearTimeout(timer); }
}

async function boundedJson(response) {
  const length = Number(response.headers?.get?.("content-length") || 0);
  if (length > 32_768) throw fail("SDXL_INVALID_RESPONSE");
  let raw;
  try {raw=await response.text();}catch{throw fail("SDXL_INVALID_RESPONSE");}
  if (raw.length > 32_768) throw fail("SDXL_INVALID_RESPONSE");
  try {return JSON.parse(raw);} catch {throw fail("SDXL_INVALID_RESPONSE");}
}

export async function submitSdxlSceneImage({campaign,brandKit,scene,plan,env=process.env,fetchFn=fetch}) {
  if (!isSdxlImageEnabled(env)) throw fail("SDXL_NOT_CONFIGURED");
  const config=sdxlApiConfig(env);
  const body={kind:"image",prompt:sdxlScenePrompt({campaign,brandKit,scene,plan}),
    negative_prompt:SDXL_NEGATIVE_PROMPT};
  const response=await request(config.baseUrl+"/v1/jobs",{
    method:"POST",body,config,fetchFn,
  });
  const payload=await boundedJson(response);
  if (!JOB_ID.test(payload?.id) || payload.kind !== "image" ||
    !PENDING.has(payload.status)) throw fail("SDXL_INVALID_RESPONSE");
  return {jobId:payload.id,status:payload.status};
}

export async function getSdxlSceneImageStatus(jobId,{env=process.env,fetchFn=fetch}={}) {
  if (!JOB_ID.test(String(jobId))) throw fail("SDXL_INVALID_RESPONSE");
  if (!isSdxlImageEnabled(env)) throw fail("SDXL_NOT_CONFIGURED");
  const config=sdxlApiConfig(env);
  const response=await request(config.baseUrl+"/v1/jobs/"+jobId,{config,fetchFn});
  const payload=await boundedJson(response);
  if (payload.id !== jobId || payload.kind !== "image") throw fail("SDXL_INVALID_RESPONSE");
  const progress=Number.isInteger(payload.progress)? Math.min(99,Math.max(0,payload.progress)):0;
  if (PENDING.has(payload.status)) return {jobId,status:payload.status,progress};
  if (payload.status === "finished") {
    if (payload?.result?.engine !== SDXL_MODEL || payload.result.width !== 576 ||
      payload.result.height !== 1024) throw fail("SDXL_INVALID_RESPONSE");
    return {jobId,status:"finished",progress:100};
  }
  if (["failed","stopped","canceled"].includes(payload.status)) throw fail("SDXL_JOB_FAILED");
  throw fail("SDXL_INVALID_RESPONSE");
}

export async function getSdxlSceneImageArtifact(jobId,{env=process.env,fetchFn=fetch}={}) {
  if (!JOB_ID.test(String(jobId))) throw fail("SDXL_INVALID_RESPONSE");
  if (!isSdxlImageEnabled(env)) throw fail("SDXL_NOT_CONFIGURED");
  const config=sdxlApiConfig(env);
  const response=await request(config.baseUrl+"/v1/jobs/"+jobId+"/artifact",{
    config,fetchFn,timeoutMs:25000,
  });
  const length=Number(response.headers?.get?.("content-length") || 0);
  if (length>IMAGE_LIMIT) throw fail("SDXL_INVALID_OUTPUT");
  let bytes;
  try {
    if (response.body?.getReader) {
      const reader=response.body.getReader();
      const chunks=[];let total=0;
      try {
        while(true) {
          const {done,value}=await reader.read();
          if(done)break;
          total+=value.length;
          if(total>IMAGE_LIMIT) throw fail("SDXL_INVALID_OUTPUT");
          chunks.push(Buffer.from(value));
        }
      } finally {reader.releaseLock();}
      bytes=Buffer.concat(chunks,total);
    } else {
      bytes=Buffer.from(await response.arrayBuffer());
    }
  } catch(error) {throw error?.code?error:fail("SDXL_INVALID_OUTPUT");}
  if(bytes.length<1024||bytes.length>IMAGE_LIMIT)throw fail("SDXL_INVALID_OUTPUT");
  try {detectImageFormat(bytes,"image/png");}
  catch {throw fail("SDXL_INVALID_OUTPUT");}
  return {bytes,extension:"png",mimeType:"image/png",model:SDXL_MODEL,provider:"sdxl_local"};
}
