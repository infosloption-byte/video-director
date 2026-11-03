// Per-scene opt-in AI art. Keep the source-grounded FFmpeg layout as a
// non-stock fallback; return the fallback reason so the UI is transparent.
// Output remains an authenticated project/scene PNG and is never a provider URL.
import crypto from "node:crypto";
import path from "node:path";
import { writeFile, rm, rename, mkdir, open, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWebsiteBrandedVisual, brandSceneImagePath, brandSceneImageUrl, resolveMarketingBrandKit } from "./websiteBrandedVisualService.js";
import { planWebsiteSceneVisual } from "./websiteBrandKit.js";
import { fetchPublicWebsiteImage } from "./websiteSafeFetch.js";
import { WEBSITE_IMAGE_MODEL, generateWebsiteAiImage, isMarketingAiImagesEnabled, imageModelFromEnv } from "./websiteAiImageService.js";
import { measureGeneration } from "./generationTelemetry.js";

const execAsync = promisify(execFile);
export function marketingImageAvailable(env = process.env) {
  const requestedModel = env.VOXORA_MARKETING_IMAGE_MODEL || WEBSITE_IMAGE_MODEL;
  let modelValid = true;
  try { imageModelFromEnv(env); } catch { modelValid = false; }
  return { enabled:isMarketingAiImagesEnabled(env) && modelValid, provider:"gemini",
    model: modelValid ? requestedModel : null, paid:true,
    policy:"No Pexels fallback. AI art is illustrative; website asset rights and claims require review." };
}
export async function createWebsiteMarketingVisual({
  project, sceneId, scene, sceneIndex = 0, sceneCount = 1, variant = 0,
  visualMode = "brand",
  // Explicit paid scene requests must leave an existing visual intact on failure.
  // Legacy/test callers may still opt into a labeled local-brand fallback.
  fallbackOnAiFailure = true,
  brandKit: suppliedKit = null,
  aiGenerate = generateWebsiteAiImage,
  brandGenerate = createWebsiteBrandedVisual,
  imageFetch = fetchPublicWebsiteImage,
  runCommand = execAsync,
  trace = measureGeneration,
  env = process.env,
}) {
  if (!project?.researchSources?.websiteMarketing || project.signal?.category !== "WEBSITE_MARKETING") {
    throw new Error("AI visuals are only available for Website to Video projects.");
  }
  if (!["brand","ai"].includes(visualMode)) {
    const error = new Error("Unsupported marketing visual mode.");
    error.code = "INVALID_VISUAL_MODE";
    throw error;
  }
  const baseArgs = { project,sceneId,scene,sceneIndex,sceneCount,variant,brandKit:suppliedKit };
  if (visualMode === "brand") return brandGenerate(baseArgs);
  if (!isMarketingAiImagesEnabled(env)) {
    const error = new Error("AI image generation is not enabled for this workspace.");
    error.code = "AI_IMAGES_DISABLED";
    throw error;
  }
  const campaign = project.researchSources.websiteMarketing;
  const brandKit = suppliedKit || await resolveMarketingBrandKit(project);
  const plan = planWebsiteSceneVisual({ campaign, brandKit, scene, sceneIndex, sceneCount, variant });
  const output = brandSceneImagePath(project.id,sceneId);
  await mkdir(path.dirname(output),{recursive:true});
  const tmpPath = path.join(path.dirname(output),"." + crypto.randomUUID());
  let candidate = null;
  try {
    // Optional public website reference image: the fetcher checks DNS,
    // redirects and file signatures. Avoid downloading random third-party
    // assets or sending customer/private assets to a hosted model.
    if (plan.sourceImageUrl && plan.sourceImageRole !== "logo") {
      try {
        const original = await imageFetch(plan.sourceImageUrl,campaign.analysisUrl);
        candidate = { bytes:original.bytes, mimeType:
          original.extension === "jpg" ? "image/jpeg" : "image/" + original.extension };
      } catch { /* keep image generation text-only */ }
    }
    const generated = await trace({
      stage:"storyboard", operation:"storyboard.website_ai_image",
      projectId:project.id, userId:project.userId, provider:"gemini",
      model:env.VOXORA_MARKETING_IMAGE_MODEL || "gemini-3.1-flash-lite-image",
      metadata: { sceneCount:1 },
    },() => aiGenerate({campaign,brandKit,scene,plan,referenceImage:candidate,env}));
    const sourcePath = tmpPath + "." + generated.extension;
    const tempOutput = tmpPath + "-composed.png";
    await writeFile(sourcePath,generated.bytes);
    const probe = await runCommand("ffprobe",[
      "-v","error","-select_streams","v:0","-show_entries","stream=width,height",
      "-of","json",sourcePath,
    ],{timeout:8000,maxBuffer:8192});
    const dimensions = JSON.parse(probe.stdout).streams?.[0] || {};
    const width = Number(dimensions.width), height = Number(dimensions.height);
    if (!(width>=320&&width<=4096&&height>=540&&height<=4096&&width*height<=12_000_000)) {
      throw Object.assign(new Error("Invalid AI image dimensions."),{code:"BAD_IMAGE_DIMENSIONS"});
    }
    // The provider was asked for 9:16. Reject landscape or near-square
    // results rather than cropping the actual product subject out of frame.
    if (width / height < 0.48 || width / height > 0.68) {
      throw Object.assign(new Error("AI image does not match vertical aspect ratio."),{code:"BAD_IMAGE_ASPECT_RATIO"});
    }
    await runCommand("ffmpeg",[
      "-hide_banner","-loglevel","error","-max_alloc","134217728","-y",
      "-i",sourcePath,"-vf",
      "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,format=rgb24",
      "-frames:v","1","-update","1",tempOutput,
    ],{timeout:45000,maxBuffer:1024*1024});
    // FFmpeg's successful exit code is not enough: a corrupt or empty PNG
    // must never be reported as a successfully generated AI image.
    const composed = await stat(tempOutput);
    if (!composed.isFile() || composed.size < 1024 || composed.size > 16 * 1024 * 1024) {
      throw Object.assign(new Error("Composed AI image output is invalid."),{code:"BAD_IMAGE_OUTPUT"});
    }
    const file = await open(tempOutput, "r");
    let signature;
    try {
      signature = Buffer.alloc(8);
      await file.read(signature,0,8,0);
    } finally { await file.close(); }
    if (!signature.equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
      throw Object.assign(new Error("Composed AI image output is not PNG."),{code:"BAD_IMAGE_OUTPUT"});
    }
    await rename(tempOutput,output);
    const url = brandSceneImageUrl(project.id,sceneId,Date.now());
    return {
      videoUrl:url, thumbnailUrl:url, assetCount:1,
      visualPlan:{
        ...plan,
        visualMode:"ai_generated_background",
        visualSource:"gemini_generated_illustration",
        imageProvider:"gemini",
        imageModel:generated.model || "gemini-3.1-flash-lite-image",
        imageWidth:width, imageHeight:height,
        sourceImageUrl:candidate ? plan.sourceImageUrl : null,
        stockUsed:false, rightsReviewRequired:Boolean(candidate),
        aiStatus:"generated",
      },
    };
  } catch (error) {
    // Never let a paid provider interruption re-introduce irrelevant Pexels.
    // Classify the error before deciding whether a local fallback is allowed.
    const safeCode = [
      "IMAGE_RATE_LIMITED", "AI_IMAGES_DISABLED", "BAD_IMAGE_DIMENSIONS",
      "BAD_IMAGE_ASPECT_RATIO", "BAD_IMAGE_OUTPUT",
      "IMAGE_AUTH_FAILED", "IMAGE_MODEL_UNAVAILABLE", "IMAGE_PROVIDER_REJECTED",
      "IMAGE_PROVIDER_ERROR", "IMAGE_TIMEOUT", "IMAGE_NO_OUTPUT",
      "IMAGE_INVALID_OUTPUT", "IMAGE_INVALID_RESPONSE",
    ].includes(error?.code) ? error.code : "IMAGE_GENERATION_UNAVAILABLE";
    // Avoid logging raw provider errors, prompts, reference images, or API keys.
    console.warn("[marketing-image] Gemini image generation failed", {
      projectId:project.id, sceneId, code:safeCode,
      providerHttpStatus:Number.isInteger(error?.httpStatus) ? error.httpStatus : null,
      quotaReason:["FREE_TIER_ZERO","SPEND_LIMIT","DAILY_LIMIT","MINUTE_LIMIT"].includes(error?.quotaReason)
        ? error.quotaReason : null,
      retryAfterSeconds:Number.isInteger(error?.retryAfterSeconds) ? error.retryAfterSeconds : null,
      model:env.VOXORA_MARKETING_IMAGE_MODEL || "gemini-3.1-flash-lite-image",
    });
    if (!fallbackOnAiFailure) {
      // The API has not yet touched SceneAsset rows. A failed paid request
      // should not silently overwrite a previously good image or its provenance.
      const failure = new Error("Gemini could not generate a usable image; the existing scene visual was preserved.");
      failure.code = safeCode;
      failure.httpStatus = Number.isInteger(error?.httpStatus) ? error.httpStatus : null;
      failure.quotaReason = ["FREE_TIER_ZERO","SPEND_LIMIT","DAILY_LIMIT","MINUTE_LIMIT"].includes(error?.quotaReason)
        ? error.quotaReason : "UNKNOWN";
      failure.retryAfterSeconds = Number.isInteger(error?.retryAfterSeconds)
        ? error.retryAfterSeconds : null;
      throw failure;
    }
    const fallback = await brandGenerate({ ...baseArgs, brandKit });
    return { ...fallback, visualPlan:{
      ...fallback.visualPlan,
      stockUsed:false,
      imageProvider:"gemini",
      imageModel:env.VOXORA_MARKETING_IMAGE_MODEL || "gemini-3.1-flash-lite-image",
      aiStatus:"fallback",
      aiFallbackCode:safeCode,
    }};
  } finally {
    await Promise.allSettled(["png","jpg","webp"].map(ext => rm(tmpPath + "." + ext,{force:true})));
    await rm(tmpPath + "-composed.png",{force:true});
  }
}
