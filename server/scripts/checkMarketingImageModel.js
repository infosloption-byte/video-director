// Safe, no-image/no-billing capability probe for the configured Gemini image
// model. An HTTP 200 verifies that the Models API recognizes the selected
// model for this API key; it does NOT guarantee image quota or artistic output.
// Never include the API key in a URL or logs.
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  WEBSITE_IMAGE_MODEL, imageModelFromEnv, isMarketingAiImagesEnabled,
} from "../src/services/websiteAiImageService.js";

export async function checkMarketingImageModel({
  env = process.env, fetchFn = fetch, timeoutMs = 10000,
} = {}) {
  const modelName = env.VOXORA_MARKETING_IMAGE_MODEL || WEBSITE_IMAGE_MODEL;
  if (!isMarketingAiImagesEnabled(env)) {
    return { ok:false, code:"AI_IMAGES_DISABLED", model:modelName };
  }
  let model;
  try {
    model = imageModelFromEnv(env);
  } catch {
    return { ok:false, code:"IMAGE_MODEL_UNAVAILABLE", model:modelName };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.min(15000, Math.max(1000,timeoutMs)));
  try {
    const result = await fetchFn(
      "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model),
      { method:"GET", headers:{ "x-goog-api-key":env.GEMINI_API_KEY }, signal:ctrl.signal },
    );
    if (result.ok) return { ok:true, code:"MODEL_ACCESSIBLE", model };
    const status = Number(result.status);
    const code = status === 401 || status === 403 ? "IMAGE_AUTH_FAILED"
      : status === 404 ? "IMAGE_MODEL_UNAVAILABLE"
      : status === 429 ? "IMAGE_RATE_LIMITED" : "IMAGE_PROVIDER_ERROR";
    return { ok:false, code, model, httpStatus:status };
  } catch (error) {
    return { ok:false, code:error?.name === "AbortError" ? "IMAGE_TIMEOUT" : "IMAGE_PROVIDER_ERROR", model };
  } finally {
    clearTimeout(timer);
  }
}

const calledAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (calledAsScript) {
  const result = await checkMarketingImageModel();
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}
