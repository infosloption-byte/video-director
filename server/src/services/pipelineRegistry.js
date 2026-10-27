/**
 * Capability registry for the FIRST pipeline batch.
 * "ready" means an adapter is already wired in the existing Voxora application.
 * Planned integrations are not selectable and cannot be published.
 */
export const PIPELINE_STAGES = Object.freeze([
  { key: "topic", label: "Topic / signal", description: "User selects a suggested signal or enters a topic.", required: true, locked: true },
  { key: "sources", label: "Evidence discovery", description: "Existing Semantic Scholar, Tavily and Brave source cascade.", required: true },
  { key: "research", label: "Research synthesis", description: "Create structured evidence-backed research.", required: true },
  { key: "verification", label: "Research verification", description: "Mandatory claim, evidence and conflict checks.", required: true, locked: true },
  { key: "storyboard", label: "Storyboard planning", description: "Write spoken scenes and visual search directions.", required: true },
  { key: "visuals", label: "Scene visuals", description: "Select stock clips for each scene.", required: true },
  { key: "speech", label: "Narration / speech", description: "Honor the user's selected preset or consented voice profile.", required: true },
  { key: "render", label: "Final video rendering", description: "Compose the final MP4 using Remotion and FFmpeg.", required: true, locked: true },
  { key: "export", label: "Export", description: "Deliver MP4, captions and script.", required: true, locked: true },
]);
export const PIPELINE_ADAPTERS = Object.freeze([
  { id: "topic-manual", provider: "Voxora", label: "Workspace topic selection", capability: "topic", available: true },
  { id: "source-cascade", provider: "Voxora", label: "Semantic Scholar + Tavily + Brave", capability: "sources", available: true },
  { id: "gemini-research", provider: "Google", label: "Existing Gemini research synthesis", capability: "research", available: true, env: "GEMINI_API_KEY" },
  { id: "voxora-verification", provider: "Voxora", label: "Evidence verification + adjudication", capability: "verification", available: true },
  { id: "gemini-storyboard", provider: "Google", label: "Existing Gemini storyboard service", capability: "storyboard", available: true, env: "GEMINI_API_KEY" },
  { id: "pexels-stock", provider: "Pexels", label: "Stock B-roll search", capability: "visuals", available: true, env: "PEXELS_API_KEY" },
  { id: "tts-selected-voice", provider: "Voxora", label: "Existing TTS gateway / customer-selected voice", capability: "speech", available: true, env: "TTS_SERVICE_URL" },
  { id: "remotion-render", provider: "Voxora", label: "Remotion + FFmpeg", capability: "render", available: true },
  { id: "voxora-export", provider: "Voxora", label: "MP4, SRT and script exports", capability: "export", available: true },
  { id: "grok-research", provider: "xAI", label: "Grok research API (planned)", capability: "research", available: false },
  { id: "grok-storyboard", provider: "xAI", label: "Grok storyboard API (planned)", capability: "storyboard", available: false },
  { id: "grok-imagine", provider: "xAI", label: "Grok Imagine (planned)", capability: "visuals", available: false },
  { id: "wan-self-hosted", provider: "Voxora GPU", label: "Wan video generation (planned)", capability: "visuals", available: false },
  { id: "grok-tts", provider: "xAI", label: "Grok text-to-speech (planned)", capability: "speech", available: false },
  { id: "qwen3-tts-standalone", provider: "Voxora GPU", label: "Dedicated Qwen3 voice adapter (planned)", capability: "speech", available: false },
]);
export const CLASSIC_PIPELINE_DEFINITION = Object.freeze({
  schemaVersion: 1,
  stages: [
    { key: "topic", adapterId: "topic-manual" },
    { key: "sources", adapterId: "source-cascade" },
    { key: "research", adapterId: "gemini-research" },
    { key: "verification", adapterId: "voxora-verification" },
    { key: "storyboard", adapterId: "gemini-storyboard" },
    { key: "visuals", adapterId: "pexels-stock" },
    { key: "speech", adapterId: "tts-selected-voice" },
    { key: "render", adapterId: "remotion-render" },
    { key: "export", adapterId: "voxora-export" },
  ],
});
const adapterMap = new Map(PIPELINE_ADAPTERS.map(adapter => [adapter.id, adapter]));

export function validatePipelineDefinition(definition) {
  const errors = [];
  if (!definition || Array.isArray(definition) || typeof definition !== "object") return { valid: false, errors: ["Pipeline definition must be an object."], warnings: [] };
  if (Object.keys(definition).sort().join(",") !== "schemaVersion,stages" || definition.schemaVersion !== 1 || !Array.isArray(definition.stages)) {
    return { valid: false, errors: ["Expected schemaVersion=1 and an ordered stages array."], warnings: [] };
  }
  if (definition.stages.length !== PIPELINE_STAGES.length) errors.push("Every required stage must appear exactly once.");
  for (let i = 0; i < PIPELINE_STAGES.length; i++) {
    const expected = PIPELINE_STAGES[i];
    const stage = definition.stages[i];
    if (!stage || Array.isArray(stage) || typeof stage !== "object") { errors.push("Stage " + expected.key + " is missing."); continue; }
    if (Object.keys(stage).sort().join(",") !== "adapterId,key") errors.push("Unsupported configuration keys in stage " + expected.key + ".");
    if (stage.key !== expected.key) errors.push("Stage order must remain fixed: expected " + expected.key + ".");
    const adapter = adapterMap.get(stage.adapterId);
    if (!adapter || adapter.capability !== expected.key) errors.push("Unsupported adapter for " + expected.key + ".");
    else if (!adapter.available) errors.push(adapter.label + " is not integrated and cannot be selected yet.");
    if (expected.locked && stage.adapterId !== CLASSIC_PIPELINE_DEFINITION.stages[i].adapterId) errors.push("Mandatory stage " + expected.key + " cannot be replaced.");
  }
  const warnings = [];
  for (const stage of definition.stages) {
    const adapter = adapterMap.get(stage?.adapterId);
    if (adapter?.env && !String(process.env[adapter.env] || "").trim()) warnings.push(adapter.label + " needs " + adapter.env + " configured on the API server.");
  }
  return { valid: errors.length === 0, errors, warnings: [...new Set(warnings)] };
}
export function pipelineCatalog() {
  return { stages: PIPELINE_STAGES, adapters: PIPELINE_ADAPTERS.map(({ env, ...adapter }) => ({ ...adapter, configured: !env || Boolean(String(process.env[env] || "").trim()) })) };
}
