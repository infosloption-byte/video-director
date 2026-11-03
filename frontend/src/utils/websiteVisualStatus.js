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
  IMAGE_GENERATION_UNAVAILABLE: "AI generation or image processing failed; check the API logs.",
};

export function websiteAiFallbackReason(code) {
  return FALLBACK_REASONS[code] || FALLBACK_REASONS.IMAGE_GENERATION_UNAVAILABLE;
}

export function websiteVisualStatus(plan) {
  if (plan?.aiStatus === "generated") {
    return "Gemini AI-generated illustration" + (plan.imageModel ? " (" + plan.imageModel + ")" : "") + ".";
  }
  if (plan?.aiStatus === "fallback") {
    return "AI image not generated: " + websiteAiFallbackReason(plan.aiFallbackCode) +
      " Showing a local FFmpeg branded layout instead.";
  }
  return "Local FFmpeg branded layout — not an AI-generated image.";
}
