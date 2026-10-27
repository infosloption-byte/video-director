export const CAPABILITIES = Object.freeze(["research", "storyboard", "visuals", "speech"]);
export const TESTABLE_CAPABILITIES = Object.freeze(["research", "storyboard"]);
export const PROVIDERS = Object.freeze({
  openai: { hostingType: "cloud", env: "OPENAI_API_KEY" },
  xai: { hostingType: "cloud", env: "XAI_API_KEY" },
  gemini: { hostingType: "cloud", env: "GEMINI_API_KEY" },
  openai_compatible: { hostingType: "hosted", env: null },
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
  if (Object.keys(input).some(key => !["name", "hostingType", "provider", "modelIdentifier", "baseUrl", "declaredCapabilities", "enabled", "apiKey"].includes(key))) bad("Unsupported model configuration field.");
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
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") bad("Enabled must be true or false.");
  const apiKey = input.apiKey === undefined ? undefined : String(input.apiKey).trim();
  if (apiKey !== undefined && (apiKey.length < 8 || apiKey.length > 2048 || /[\r\n]/.test(apiKey))) bad("Invalid API credential.");
  const baseUrl = hostingType === "hosted" ? allowedHostedOrigin(input.baseUrl, env) : null;
  if (hostingType === "cloud" && input.baseUrl) bad("Cloud endpoints are fixed by Voxora and cannot be overridden.");
  return { name, hostingType, provider, modelIdentifier, baseUrl, enabled: input.enabled !== false,
    declaredCapabilities: input.declaredCapabilities, apiKey };
}
