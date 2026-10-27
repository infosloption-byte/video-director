import { ModelPoolError, TESTABLE_CAPABILITIES, allowedHostedOrigin } from "./modelPoolValidation.js";
import { resolveModelCredential } from "./modelPoolCredentials.js";

const MAX_BYTES = 65536;
const promptFor = capability => capability === "research"
  ? 'Return ONLY JSON {"summary":"A factual one-sentence explanation of photosynthesis."}. No code fences.'
  : 'Return ONLY JSON {"scenes":[{"narration":"A concise sentence on photosynthesis.","visualPrompt":"Leaves in sunlight."}]}. No code fences.';
function validOutput(capability, value) {
  if (!value || Array.isArray(value) || typeof value !== "object") return false;
  if (capability === "research") return typeof value.summary === "string" && value.summary.trim().length >= 12;
  return Array.isArray(value.scenes) && value.scenes.length > 0 && value.scenes.length <= 3 &&
    value.scenes.every(s => typeof s?.narration === "string" && s.narration.length >= 8 && typeof s?.visualPrompt === "string" && s.visualPrompt.length >= 8);
}
async function responseBody(response) {
  if (Number(response.headers.get("content-length") || 0) > MAX_BYTES) throw new Error("Response exceeds test limit.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty response.");
  let total = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) throw new Error("Response exceeds test limit.");
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => {}); }
}
function readModelJson(text) {
  const clean = String(text || "").trim().replace(/^\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}$/, "");
  return JSON.parse(clean);
}
export async function probeModelCapability(model, capability, dependencies = {}) {
  if (!TESTABLE_CAPABILITIES.includes(capability))
    throw new ModelPoolError(409, "Live testing for this capability is not implemented. It remains unverified.");
  const credential = resolveModelCredential(model);
  if (model.hostingType === "cloud" && !credential) throw new ModelPoolError(409, "Configure a provider API credential before testing.");
  const prompt = promptFor(capability);
  const hostedOrigin = model.hostingType === "hosted" ? allowedHostedOrigin(model.baseUrl) : null;
  const gemini = model.provider === "gemini";
  const endpoint = gemini
    ? "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model.modelIdentifier) + ":generateContent"
    : model.provider === "xai" ? "https://api.x.ai/v1/chat/completions"
    : model.provider === "openai" ? "https://api.openai.com/v1/chat/completions"
    : hostedOrigin + "/v1/chat/completions";
  const headers = { "Content-Type": "application/json" };
  if (gemini) headers["x-goog-api-key"] = credential;
  else if (credential) headers.Authorization = "Bearer " + credential;
  const body = gemini
    ? { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 240 } }
    : { model: model.modelIdentifier, messages: [{ role: "user", content: prompt }],
        ...(model.provider === "openai" ? { max_completion_tokens: 240 } : { max_tokens: 240 }) };
  const fetchFn = dependencies.fetchFn || fetch;
  const started = Date.now();
  try {
    const response = await fetchFn(endpoint, {
      method: "POST", headers, body: JSON.stringify(body), redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    const latencyMs = Date.now() - started;
    if (!response.ok) return { passed: false, latencyMs, result: { code: "UPSTREAM_HTTP", httpStatus: response.status, message: "Provider rejected the test request." } };
    const payload = await responseBody(response);
    const raw = gemini ? payload.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") : payload.choices?.[0]?.message?.content;
    let output;
    try { output = readModelJson(raw); } catch { return { passed: false, latencyMs, result: { code: "INVALID_JSON", message: "Model did not return valid JSON." } }; }
    const passed = validOutput(capability, output);
    return { passed, latencyMs, result: { code: passed ? "PASS" : "INVALID_SCHEMA", message: passed ? "Structured capability test passed." : "Output did not match required Voxora schema." } };
  } catch (error) {
    return { passed: false, latencyMs: Date.now() - started, result: { code: "PROBE_ERROR", message: error?.name === "TimeoutError" ? "Provider request timed out." : "Provider request failed or response was invalid." } };
  }
}
