import { useCallback, useEffect, useState } from "react";
import "./AdminModelPoolPage.css";

const BASE = "/api/platform-admin/model-pool";
const PROVIDERS = [
  { id: "gemini", label: "Google Gemini", type: "cloud" },
  { id: "openai", label: "OpenAI", type: "cloud" },
  { id: "xai", label: "xAI / Grok", type: "cloud" },
  { id: "openrouter", label: "OpenRouter", type: "cloud" },
  { id: "openai_compatible", label: "OpenAI-compatible endpoint", type: "hosted" },
];
// These provider defaults are also enforced by the backend; the browser does
// not authorize credential destinations.
function recommendedEndpoint(provider, modelId, legacyOrigin = "") {
  if (provider === "gemini") return "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(modelId || "") + ":generateContent";
  if (provider === "openai") return "https://api.openai.com/v1/chat/completions";
  if (provider === "xai") return "https://api.x.ai/v1/chat/completions";
  if (provider === "openrouter") return "https://openrouter.ai/api/v1/chat/completions";
  if (provider === "openai_compatible" && legacyOrigin) return legacyOrigin.replace(/\/$/, "") + "/v1/chat/completions";
  return "";
}
const CAPS = [
  { id: "research", label: "Research synthesis", test: true },
  { id: "storyboard", label: "Storyboard generation", test: true },
  { id: "visuals", label: "Visual / video generation", test: false },
  { id: "speech", label: "Text-to-speech", test: false },
];
async function api(path = "", options = {}) {
  const response = await fetch(BASE + path, {
    credentials: "include", cache: "no-store", ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Model Pool request failed.");
  return data;
}
function Pill({ good, children }) { return <span className={"mp-pill " + (good ? "good" : "")}>{children}</span>; }
function Form({ existing, saved, cancel }) {
  const [name, setName] = useState(existing?.name || "");
  const [hostingType, setHostingType] = useState(existing?.hostingType || "cloud");
  const [provider, setProvider] = useState(existing?.provider || "gemini");
  const [modelIdentifier, setModelIdentifier] = useState(existing?.modelIdentifier || "");
  const [endpointUrl, setEndpointUrl] = useState(
    existing?.endpointUrl || recommendedEndpoint(existing?.provider || "gemini", existing?.modelIdentifier || "", existing?.baseUrl),
  );
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [capabilities, setCapabilities] = useState(existing?.declaredCapabilities || ["research", "storyboard"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function changeType(type) {
    const nextProvider = type === "cloud" ? "gemini" : "openai_compatible";
    setHostingType(type); setProvider(nextProvider);
    setEndpointUrl(recommendedEndpoint(nextProvider, modelIdentifier));
  }
  function changeProvider(value) {
    setProvider(value); setEndpointUrl(recommendedEndpoint(value, modelIdentifier));
  }
  function changeModelIdentifier(value) {
    setModelIdentifier(value);
    if (provider === "gemini") setEndpointUrl(recommendedEndpoint("gemini", value));
  }
  function toggleCapability(cap) {
    setCapabilities(previous => previous.includes(cap) ? previous.filter(x => x !== cap) : [...previous, cap]);
  }
  async function save(event) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const body = { name, hostingType, provider, modelIdentifier, endpointUrl,
        declaredCapabilities: capabilities, enabled,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) };
      await api(existing ? "/" + existing.id : "", {
        method: existing ? "PUT" : "POST", body: JSON.stringify(body),
      });
      setApiKey(""); saved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <form className="mp-editor" onSubmit={save}>
    <div className="mp-section-head"><div><h2>{existing ? "Edit model" : "Register a model"}</h2><p>Each model has its own connection and declared capabilities.</p></div><button type="button" className="mp-button" onClick={cancel}>Close</button></div>
    <label>Hosting type</label>
    <div className="mp-segments" role="group" aria-label="Hosting type">
      {["cloud", "hosted"].map(type => <button type="button" key={type} className={hostingType === type ? "selected" : ""} aria-pressed={hostingType === type} onClick={() => changeType(type)}>{type === "cloud" ? "Cloud API" : "Self-hosted GPU / API"}</button>)}
    </div>
    <div className="mp-form-grid">
      <label>Display name<input required minLength={3} maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Gemini research"/></label>
      <div className="mp-field"><label>Provider</label><div className="mp-choice" role="group" aria-label="Provider">{PROVIDERS.filter(p => p.type === hostingType).map(p => <button type="button" key={p.id} className={provider === p.id ? "selected" : ""} aria-pressed={provider === p.id} onClick={() => changeProvider(p.id)}>{p.label}</button>)}</div></div>
      <label>API model identifier<input required maxLength={120} pattern="[A-Za-z0-9][A-Za-z0-9._:/-]+" value={modelIdentifier} onChange={e => changeModelIdentifier(e.target.value)} placeholder={provider === "gemini" ? "gemini-2.5-flash" : provider === "openai" ? "gpt-4.1-mini" : provider === "xai" ? "grok-4" : provider === "openrouter" ? "openai/gpt-4o-mini" : "model-id"}/></label>
      {provider === "openrouter" && <p className="mp-note">Enter an OpenRouter model slug such as openai/gpt-4o-mini, and use an OpenRouter API key or OPENROUTER_API_KEY on the server. Live tests may incur API charges.</p>}
      <label className="mp-endpoint-field">Model API endpoint URL
        <input required type="url" maxLength={1024} value={endpointUrl} onChange={e => setEndpointUrl(e.target.value)}
          placeholder={hostingType === "hosted" ? "https://gpu.example.net/v1/chat/completions" : recommendedEndpoint(provider, modelIdentifier)}
          autoComplete="url"/>
        <small>{hostingType === "cloud"
          ? "Provider default filled automatically. For security, only this provider's approved endpoint is accepted."
          : "Full API endpoint including request path. Its origin must be explicitly approved in AI_POOL_ALLOWED_ORIGINS on the API server."}</small>
      </label>
      <label>API key or access token<input type="password" autoComplete="new-password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={existing?.hasStoredCredential ? "Leave empty to keep encrypted key" : "Optional when server environment provides the key"}/><small>Encrypted on the server; never returned to the browser. Self-hosted endpoints may permit unauthenticated access.</small></label>
    </div>
    <div className="mp-field"><label>Declared capabilities</label><div className="mp-capchoices">{CAPS.map(c => <label key={c.id} className="mp-check"><input type="checkbox" checked={capabilities.includes(c.id)} onChange={() => toggleCapability(c.id)}/><span>{c.label}</span><small>{c.test ? "Live test available" : "Tester not implemented yet"}</small></label>)}</div></div>
    <label className="mp-check"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}/><span>Enabled for admin testing</span></label>
    <p className="mp-note">Saving any model changes resets its verified capabilities until each one is re-tested.</p>
    {error && <p className="mp-error" role="alert">{error}</p>}
    <button type="submit" disabled={busy || !capabilities.length} className="mp-button primary">{busy ? "Saving…" : existing ? "Update model" : "Register model"}</button>
  </form>;
}
function ModelCard({ model, edit, run, busy }) {
  const requested = model.declaredCapabilities || [];
  return <article className="mp-model">
    <div className="mp-model-head"><div><span className="mp-kind">{model.hostingType === "cloud" ? "CLOUD API" : "SELF HOSTED"}</span><h3>{model.name}</h3><p>{model.provider} · {model.modelIdentifier}</p><p className="mp-endpoint-preview" title={model.endpointUrl || ""}>Endpoint: {model.endpointUrl || "Not configured"}</p></div><Pill good={model.enabled && model.credentialConfigured}>{!model.enabled ? "Disabled" : model.credentialConfigured ? "Credential ready" : "Credential missing / optional"}</Pill></div>
    <div className="mp-verified"><strong>Stage eligibility</strong>
      {model.verifiedCapabilities.length ? <div className="mp-tags">{model.verifiedCapabilities.map(cap => <Pill key={cap} good>{cap} verified</Pill>)}</div>
        : <p>No verified capabilities yet. Declaring a capability does not grant stage access.</p>}
    </div>
    <div className="mp-test-grid">{requested.map(cap => {
      const info = CAPS.find(x => x.id === cap);
      const history = model.tests.find(t => t.capability === cap);
      return <div className="mp-testrow" key={cap}>
        <div><strong>{info?.label || cap}</strong><small>{history ? (history.current ? history.passed ? "Last test passed" : "Last test failed" : "Retest required") : "Not tested"}</small>
          {history && <small>{history.latencyMs} ms · {history.result?.code || "TEST"} · {new Date(history.createdAt).toLocaleString()}</small>}</div>
        <button type="button" className="mp-button" disabled={busy || !model.enabled || !info?.test}
          onClick={() => run(model, cap)}>{busy ? "Testing…" : info?.test ? "Run live test" : "Coming later"}</button>
      </div>;
    })}</div>
    <div className="mp-bottom"><span>Revision {model.revision} · {model.hasStoredCredential ? "Stored encrypted key" : "Environment key or keyless"}</span><button type="button" className="mp-button" onClick={() => edit(model)}>Edit configuration</button></div>
  </article>;
}
export default function AdminModelPoolPage() {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = useCallback(async () => { const result = await api(); setData(result); }, []);
  useEffect(() => {
    let active = true;
    api().then(result => { if (active) setData(result); }).catch(err => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const startEdit = model => { setEditing(model); setFormOpen(true); setError(""); };
  const saved = async () => {
    setFormOpen(false); setEditing(null);
    try { await refresh(); setNotice("Model configuration saved. Re-test capabilities before pipeline selection."); }
    catch (err) { setError(err.message); }
  };
  const runTest = async (model, capability) => {
    if (!window.confirm("Run a live, potentially billable " + capability + " API test for " + model.name + "? No customer data will be sent.")) return;
    setBusy(model.id + capability); setError(""); setNotice("");
    try {
      const result = await api("/" + model.id + "/test/" + capability, { method: "POST" });
      await refresh();
      setNotice(result.test.passed ? capability + " passed. Model is now eligible for the corresponding draft pipeline stage." : capability + " failed. Review the test report before retrying.");
    } catch (err) { setError(err.message); }
    finally { setBusy(""); }
  };
  return <div className="mp-page">
    <header className="mp-header"><div><span className="eyebrow">Voxora / AI Infrastructure</span><h1>AI Model Pool</h1><p>Manage cloud models, self-hosted inference endpoints and capability verification separately from production workflows.</p></div>
      <button className="mp-button primary" type="button" onClick={() => { setEditing(null); setFormOpen(true); }}>+ Add AI model</button></header>
    <div className="mp-banner"><strong>Admin-only, preproduction configuration.</strong> Research and storyboard tests make real API requests and may incur provider charges. Visual/video and speech verification are not yet implemented. The live workspace continues using Voxora Classic.</div>
    {error && <p className="mp-error" role="alert">{error}</p>}
    {notice && <p className="mp-success" role="status">{notice}</p>}
    {loading && <p role="status">Loading model pool…</p>}
    {data && !data.encryptionReady && <div className="mp-banner"><strong>Encrypted credential storage is not configured.</strong> Set AI_POOL_ENCRYPTION_KEY on the API server before entering cloud API keys in Admin. Existing provider environment variables can be used without storing a key here.</div>}
    {data && !formOpen && <div className="mp-summary"><span>{data.models.length} registered models</span><span>{data.models.reduce((sum, m) => sum + m.verifiedCapabilities.length, 0)} passing stage capabilities</span><span>Host allowlist: {data.hostedOriginConfigured ? "configured" : "not configured"}</span><span>Encrypted key storage: {data.encryptionReady ? "configured" : "setup required"}</span></div>}
    {formOpen ? <Form key={(editing?.id || "new") + (editing?.revision || "")} existing={editing} saved={saved} cancel={() => setFormOpen(false)}/> : data && <div className="mp-models">
      {data.models.length ? data.models.map(model => <ModelCard key={model.id} model={model} edit={startEdit} run={runTest} busy={busy === model.id + "research" || busy === model.id + "storyboard"}/>) :
        <section className="mp-empty"><h2>No AI models registered</h2><p>Add an OpenAI, Gemini, xAI Grok, OpenRouter or self-hosted inference model. Then verify its capabilities before choosing it in a draft pipeline.</p></section>}
    </div>}
  </div>;
}
