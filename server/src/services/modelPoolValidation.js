export const CAPABILITIES = Object.freeze(["research", "storyboard", "visuals", "speech"]);
export const TESTABLE_CAPABILITIES = Object.freeze(["research", "storyboard", "speech"]);
export const PROVIDERS = Object.freeze({
  openai: { hostingType: "cloud", env: "OPENAI_API_KEY" },
  xai: { hostingType: "cloud", env: "XAI_API_KEY" },
  gemini: { hostingType: "cloud", env: "GEMINI_API_KEY" },
  openrouter: { hostingType: "cloud", env: "OPENROUTER_API_KEY" },
  openai_compatible: { hostingType: "hosted", env: null },
  voxora_tts: { hostingType: "hosted", env: "GPU_TTS_AUTH_TOKEN" },
});
export const STAGE_CAPABILITY = Object.freeze({
  research: "research", storyboard: "storyboard", visuals: "visuals", speech: "speech",
});
export class ModelPoolError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = message => { throw new ModelPoolError(400, message); };
const isRecord = v => v !== null && typeof v === "object" && !Array.isArray(v);

export function allowedHostedOrigin(url, environment = process.env) {
  if (!url || typeof url !== "string" || url.length > 512) bad("Hosted model requires a permitted endpoint URL.");
  let parsed;
  try { parsed = new URL(url); } catch { bad("Invalid hosted model URL."); }
  if (parsed.username || parsed.password || parsed.hash || parsed.search || (parsed.pathname !== "/" && parsed.pathname !== "")) bad("Use only a trusted host origin, without a path or embedded credentials.");
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && environment.AI_POOL_ALLOW_INSECURE_HTTP === "true")) bad("Hosted endpoint must use HTTPS.");
  const origins = String(environment.AI_POOL_ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!origins.includes(parsed.origin)) bad("Hosted origin is not in the operator-approved AI_POOL_ALLOWED_ORIGINS list.");
  return parsed.origin;
}

export function validateModelInput(input, env = process.env) {
  if (!isRecord(input)) bad("Invalid model payload.");
  if (Object.keys(input).some(key => !["name", "hostingType", "provider", "modelIdentifier", "baseUrl", "endpointUrl", "declaredCapabilities", "enabled", "apiKey"].includes(key))) bad("Unsupported model configuration field.");
  const name = String(input.name || "").trim();
  if (name.length < 3 || name.length > 120) bad("Model name must be 3 to 120 characters.");
  const provider = String(input.provider || "");
  const hostingType = String(input.hostingType || "");
  if (!Object.hasOwn(PROVIDERS, provider) || PROVIDERS[provider].hostingType !== hostingType) bad("Invalid hosting type or provider.");
  const modelIdentifier = String(input.modelIdentifier || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:\/-]{1,119}$/.test(modelIdentifier)) bad("Invalid model identifier.");
  if (!Array.isArray(input.declaredCapabilities) || input.declaredCapabilities.length === 0 ||
      new Set(input.declaredCapabilities).size !== input.declaredCapabilities.length ||
      input.declaredCapabilities.some(cap => !CAPABILITIES.includes(cap))) bad("Select at least one supported capability without duplicates.");
  if (provider === "voxora_tts" &&
      (input.declaredCapabilities.length !== 1 || input.declaredCapabilities[0] !== "speech" ||
       !["kokoro", "qwen3-tts-0.6b"].includes(modelIdentifier)))
    bad("Voxora TTS supports only the speech capability and the deployed kokoro or qwen3-tts-0.6b engines.");
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") bad("Enabled must be true or false.");
  const apiKey = input.apiKey === undefined ? undefined : String(input.apiKey).trim();
  if (apiKey !== undefined && (apiKey.length < 8 || apiKey.length > 2048 || /[\r\n]/.test(apiKey))) bad("Invalid API credential.");
  if (hostingType === "cloud" && input.baseUrl) bad("Cloud endpoints must use their approved provider URLs.");
  const fallbackEndpoint = defaultModelEndpoint(provider, modelIdentifier, input.baseUrl);
  const endpointUrl = validateModelEndpoint(
    provider, hostingType, input.endpointUrl ?? fallbackEndpoint, modelIdentifier, env,
  );
  const baseUrl = hostingType === "hosted" ? new URL(endpointUrl).origin : null;
  if (hostingType === "hosted" && input.baseUrl && allowedHostedOrigin(input.baseUrl, env) !== baseUrl)
    bad("The hosted endpoint and approved origin must match.");
  return { name, hostingType, provider, modelIdentifier, baseUrl, endpointUrl,
    enabled: input.enabled !== false, declaredCapabilities: input.declaredCapabilities, apiKey };
}

/**
 * The endpoint saved for a model's actual capability probe.
 *
 * Cloud credentials must never be sent to a caller-supplied host/path. Only
 * the provider's approved URL is accepted. Self-hosted endpoints may use
 * different API paths, but the host origin must be operator-allowlisted.
 */
export function defaultModelEndpoint(provider, modelIdentifier, baseUrl = "") {
  if (provider === "gemini") {
    return "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(modelIdentifier || "") + ":generateContent";
  }
  if (provider === "openai") return "https://api.openai.com/v1/chat/completions";
  if (provider === "xai") return "https://api.x.ai/v1/chat/completions";
  if (provider === "openrouter") return "https://openrouter.ai/api/v1/chat/completions";
  if (provider === "openai_compatible") return baseUrl ? (baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl) + "/v1/chat/completions" : "";
  if (provider === "voxora_tts") return baseUrl ? baseUrl.replace(/\/$/, "") + "/v1/audio/speech" : "";
  return "";
}
export function validateModelEndpoint(provider, hostingType, endpointUrl, modelIdentifier, env = process.env) {
  if (typeof endpointUrl !== "string" || !endpointUrl.trim() || endpointUrl.length > 1024)
    bad("A valid model API endpoint URL is required.");
  const value = endpointUrl.trim();
  let parsed;
  try { parsed = new URL(value); } catch { bad("Model endpoint must be a valid absolute URL."); }
  if (parsed.username || parsed.password || parsed.search || parsed.hash ||
      !["http:", "https:"].includes(parsed.protocol))
    bad("Model endpoint cannot contain credentials, query parameters, or fragments.");
  if (parsed.href !== value) bad("Use a canonical endpoint URL without unnecessary suffixes.");
  if (hostingType === "cloud") {
    const approved = defaultModelEndpoint(provider, modelIdentifier);
    if (!approved || value !== approved)
      bad("Cloud provider endpoint must match its approved official API URL; API keys cannot be sent to arbitrary endpoints.");
  } else if (hostingType === "hosted" && provider === "openai_compatible") {
    // Existing operator-managed origin validation controls destinations;
    // endpoint paths can vary between trusted OpenAI-compatible gateways.
    allowedHostedOrigin(parsed.origin, env);
    if (!parsed.pathname || parsed.pathname === "/")
      bad("Hosted endpoint must specify a supported API request path.");
  } else if (hostingType === "hosted" && provider === "voxora_tts") {
    allowedHostedOrigin(parsed.origin, env);
    if (parsed.pathname !== "/v1/audio/speech") bad("Voxora TTS requires the fixed /v1/audio/speech endpoint.");
  } else bad("Unsupported provider or hosting type.");
  return value;
}
export function resolveModelEndpoint(model, env = process.env) {
  const stored = typeof model.endpointUrl === "string" && model.endpointUrl.trim()
    ? model.endpointUrl.trim()
    : defaultModelEndpoint(model.provider, model.modelIdentifier, model.baseUrl);
  return validateModelEndpoint(model.provider, model.hostingType, stored, model.modelIdentifier, env);
}
