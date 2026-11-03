// User-facing provenance for Website to Video visuals. Never expose provider responses,
// API keys, website prompt contents, or untrusted error messages in the storyboard.
const FALLBACK_REASONS = {
  IMAGE_RATE_LIMITED: "Gemini rate limit or quota reached.",
  IMAGE_AUTH_FAILED: "Gemini rejected the API key or image-model access.",
  IMAGE_MODEL_UNAVAILABLE: "The configured Gemini image model is unavailable.",
  IMAGE_PROVIDER_REJECTED: "Gemini rejected the image request.",
  IMAGE_PROVIDER_ERROR: "Gemini returned a server error.",
  IMAGE_TIMEOUT: "Gemini did not respond before the request timed out.",
  IMAGE_NO_OUTPUT: "Gemini returned no image.",
  IMAGE_INVALID_OUTPUT: "Gemini returned invalid or unsupported image data.",
  IMAGE_INVALID_RESPONSE: "Gemini returned an unreadable response.",
  BAD_IMAGE_DIMENSIONS: "The returned image had unsupported dimensions.",
  BAD_IMAGE_ASPECT_RATIO: "Gemini returned an image with an incorrect aspect ratio.",
  BAD_IMAGE_OUTPUT: "The generated image could not be validated after conversion.",
  IMAGE_GENERATION_UNAVAILABLE: "AI generation or image processing failed; check the API logs.",
  SDXL_NOT_CONFIGURED: "Local SDXL service is not configured; ask an operator to enable the private GPU connection.",
  SDXL_NOT_READY: "Local SDXL is not ready. Shared GPU scheduling and model admission must be approved first.",
  SDXL_JOB_REQUIRED: "Local SDXL requires a completed authenticated GPU image job.",
  SDXL_AUTH_FAILED: "The private GPU service rejected the configured service credentials.",
  SDXL_QUEUE_FULL: "The GPU image queue is full. Try again after other jobs complete.",
  SDXL_JOB_MISSING: "The requested image job is no longer available. Start a new image request.",
  SDXL_UNAVAILABLE: "The local SDXL service is unreachable. Existing artwork has been kept.",
  SDXL_TIMEOUT: "The private SDXL service did not respond before its request timeout.",
  SDXL_JOB_FAILED: "The SDXL model failed to generate an image. Existing artwork has been kept.",
  SDXL_INVALID_OUTPUT: "The SDXL image artifact is invalid; no scene artwork was replaced.",
  SDXL_INVALID_RESPONSE: "The private SDXL service returned an unexpected job response.",
};

export function websiteAiFallbackReason(code) {
  return FALLBACK_REASONS[code] || FALLBACK_REASONS.IMAGE_GENERATION_UNAVAILABLE;
}

export function websiteAiQuotaExplanation({ code, quotaReason, retryAfterSeconds } = {}) {
  if (code !== "IMAGE_RATE_LIMITED") return websiteAiFallbackReason(code);
  const explanation = quotaReason === "FREE_TIER_ZERO"
    ? "Google reports zero free-tier quota for this image model. Enable paid Gemini API billing on the project associated with your API key."
    : quotaReason === "DAILY_LIMIT"
    ? "Gemini daily image quota exhausted. Check your project's model quota in Google AI Studio; daily quotas reset at midnight Pacific time."
    : quotaReason === "MINUTE_LIMIT"
    ? "Gemini per-minute image quota exceeded. Reduce image requests and check the model's active limits in Google AI Studio."
    : quotaReason === "SPEND_LIMIT"
    ? "Gemini project spending limit reached. Review project billing, credits and spend caps in Google AI Studio."
    : "Gemini rate limit or quota reached. This image model has no free API tier; check the project billing tier and image-model quotas in Google AI Studio.";
  const retry = Number(retryAfterSeconds);
  return explanation + (quotaReason !== "FREE_TIER_ZERO" &&
    Number.isInteger(retry) && retry > 0 && retry <= 86400
    ? " Google suggested retrying after " + retry + " seconds." : "");
}

export function websiteVisualStatus(plan) {
  if (plan?.aiStatus === "generated") {
    return (plan.imageProvider === "sdxl_local" ? "Local SDXL AI-generated illustration" : "Gemini AI-generated illustration") + (plan.imageModel ? " (" + plan.imageModel + ")" : "") + ".";
  }
  if (plan?.aiStatus === "fallback") {
    return "AI image not generated: " + websiteAiFallbackReason(plan.aiFallbackCode) +
      " Showing a local FFmpeg branded layout instead.";
  }
  return "Local FFmpeg branded layout — not an AI-generated image.";
}
