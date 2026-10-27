import { useEffect, useState } from "react";
import "./AdminManagementPage.css";

const TITLES = {
  plans: ["Plans & Limits", "Manage subscription allowances without changing Paddle prices."],
  settings: ["Platform Settings", "Control public signup and workspace announcements."],
  "master-data": ["Master Data", "Maintain storyboard tones and audience options."],
  integrations: ["AI Integrations", "Configuration status for existing AI integrations."],
  audit: ["Admin Audit", "History of audited administrative changes."],
};
async function api(endpoint, method = "GET", data) {
  const response = await fetch("/api/platform-admin/" + endpoint, {
    method, credentials: "include", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || "Admin request failed.");
  return json;
}
function Toggle({ checked, change, label }) {
  return <button type="button" className={"am-toggle " + (checked ? "on" : "")} role="switch" aria-label={label} aria-checked={checked} onClick={() => change(!checked)}><span /></button>;
}
function PlanForm({ item, onSuccess }) {
  const [renders, setRenders] = useState(String(item.rendersPerMonth));
  const [seconds, setSeconds] = useState(String(item.maxSeconds));
  const [error, setError] = useState("");
  async function save(e) {
    e.preventDefault();
    try {
      await api("plans/" + encodeURIComponent(item.id), "PUT", { rendersPerMonth: Number(renders), maxSeconds: Number(seconds) });
      onSuccess("Updated " + item.name + " limits.");
    } catch (err) { setError(err.message); }
  }
  return <form className="am-panel" onSubmit={save}><h2>{item.name}</h2><p>USD {item.monthlyUsd} monthly · Prices managed by Paddle</p>
    <label>Monthly render credits<input type="number" min="1" max="100000" step="1" required value={renders} onChange={e => setRenders(e.target.value)} /></label>
    <label>Maximum duration (seconds)<input type="number" min="15" max="600" step="15" required value={seconds} onChange={e => setSeconds(e.target.value)} /></label>
    {error && <p className="am-error">{error}</p>}
    <button type="submit" className="am-save" disabled={Number(renders) === item.rendersPerMonth && Number(seconds) === item.maxSeconds}>Save limits</button>
  </form>;
}
function SettingsForm({ item, onSuccess }) {
  const [open, setOpen] = useState(item.registrationOpen);
  const [announcement, setAnnouncement] = useState(item.announcement || "");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  async function save(e) {
    e.preventDefault();
    if (item.registrationOpen && !open && !confirm) { setConfirm(true); return; }
    try {
      await api("settings", "PUT", { registrationOpen: open, announcement });
      onSuccess("Platform settings saved.");
    } catch (err) { setError(err.message); }
  }
  return <form className="am-panel" onSubmit={save}>
    <div className="am-row"><div><h2>Public registrations</h2><p>Disable new signups without disrupting existing accounts.</p></div><Toggle label="Allow new accounts" checked={open} change={v => { setOpen(v); setConfirm(false); }} /></div>
    <label>Workspace announcement<textarea rows={4} maxLength={240} value={announcement} onChange={e => setAnnouncement(e.target.value)} placeholder="Optional service notice" /><small>{announcement.length} / 240</small></label>
    {confirm && <p className="am-warning" role="alert">New signups will be paused. Press Save again to confirm. <button type="button" onClick={() => setConfirm(false)}>Cancel</button></p>}
    {error && <p className="am-error">{error}</p>}
    <button type="submit" className="am-save">{confirm ? "Confirm and save" : "Save settings"}</button>
  </form>;
}
function MasterRow({ item, onSuccess }) {
  const [label, setLabel] = useState(item.label);
  const [order, setOrder] = useState(String(item.sortOrder));
  const [active, setActive] = useState(item.active);
  const [error, setError] = useState("");
  async function save(e) {
    e.preventDefault();
    try {
      await api("master-data/" + encodeURIComponent(item.id), "PUT", { label, sortOrder: Number(order), active });
      onSuccess("Master data updated.");
    } catch (err) { setError(err.message); }
  }
  return <form className="am-master-row" onSubmit={save}><strong>{item.code}</strong>
    <label>Label<input value={label} required minLength={2} maxLength={100} onChange={e => setLabel(e.target.value)} /></label>
    <label>Order<input type="number" min="0" max="10000" required value={order} onChange={e => setOrder(e.target.value)} /></label>
    <div><Toggle label={"Enable " + item.code} checked={active} change={setActive} /><small>{active ? "Active" : "Archived"}</small></div>
    <button type="submit" disabled={label === item.label && Number(order) === item.sortOrder && active === item.active}>Save</button>
    {error && <p className="am-error">{error}</p>}
  </form>;
}
function MasterForm({ data, onSuccess }) {
  const [filter, setFilter] = useState("tone");
  const [category, setCategory] = useState("tone");
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [order, setOrder] = useState("100");
  const [error, setError] = useState("");
  async function create(e) {
    e.preventDefault();
    try {
      await api("master-data", "POST", { category, code, label, sortOrder: Number(order) });
      setCode(""); setLabel(""); onSuccess("Master option created.");
    } catch (err) { setError(err.message); }
  }
  return <div className="am-stack"><p className="am-info">These options appear in the guided video setup. Archive unused values rather than deleting them. At least one active value must remain per category.</p>
    <form className="am-panel" onSubmit={create}><h2>Add master data</h2><div className="am-choice">{["tone", "audience"].map(v => <button type="button" key={v} aria-pressed={category === v} className={v === category ? "active" : ""} onClick={() => setCategory(v)}>{v === "tone" ? "Tone" : "Audience"}</button>)}</div>
      <div className="am-fields"><label>Code<input required pattern="[a-z0-9-]{2,60}" maxLength={60} placeholder="documentary" value={code} onChange={e => setCode(e.target.value)} /></label>
      <label>Label<input required minLength={2} maxLength={100} value={label} onChange={e => setLabel(e.target.value)} /></label>
      <label>Order<input required type="number" min="0" max="10000" value={order} onChange={e => setOrder(e.target.value)} /></label></div>
      {error && <p className="am-error">{error}</p>}<button className="am-save" type="submit">Add option</button>
    </form>
    <section className="am-panel"><div className="am-row"><h2>Existing options</h2><div className="am-choice">{["tone", "audience"].map(v => <button type="button" key={v} aria-pressed={v === filter} className={v === filter ? "active" : ""} onClick={() => setFilter(v)}>{v === "tone" ? "Tones" : "Audiences"}</button>)}</div></div>
      {(data.items || []).filter(item => item.category === filter).map(item => <MasterRow key={item.id + String(item.updatedAt)} item={item} onSuccess={onSuccess} />)}
    </section>
  </div>;
}
function Other({ data, section }) {
  if (section === "integrations") return <section className="am-panel"><h2>AI provider configuration</h2><p>This page shows environment configuration, not live provider health or on/off control.</p>
    {(data.integrations || []).map(row => <div className="am-readrow" key={row.id}><div><strong>{row.name}</strong><small>{row.capability}</small></div><span>{row.configured ? "Configured" : "Not configured"}</span></div>)}
  </section>;
  return <section className="am-panel"><h2>Recorded changes</h2>
    {(data.items || []).map(row => <div className="am-audit" key={row.id}><strong>{row.action}</strong><small>{new Date(row.createdAt).toLocaleString()}</small><code>{JSON.stringify(row.metadata || {})}</code></div>)}
    {!(data.items || []).length && <p>No admin changes have been recorded.</p>}
  </section>;
}
export default function AdminManagementPage({ section }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const path = section === "integrations" ? "overview" : section === "audit" ? "admin-audit" : section;
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/platform-admin/" + path, { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async res => { const val = await res.json().catch(() => ({})); if (!res.ok) throw new Error(val.error || "Unable to fetch settings."); return val; })
      .then(val => { if (!controller.signal.aborted) { setData(val); setError(""); } })
      .catch(err => { if (!controller.signal.aborted) { setData(null); setError(err.message); } });
    return () => controller.abort();
  }, [path, refresh]);
  const [title, description] = TITLES[section] || ["Administration", "Manage platform configuration."];
  const saved = message => { setNotice(message); setRefresh(n => n + 1); };
  return <div className="am-page"><header className="am-head"><span className="eyebrow">Voxora / Administration</span><h1>{title}</h1><p>{description}</p></header>
    {notice && <div className="am-success" role="status">{notice}<button type="button" aria-label="Dismiss" onClick={() => setNotice("")}>×</button></div>}
    {error && <div className="am-error" role="alert">{error}<button type="button" onClick={() => setRefresh(n => n + 1)}>Retry</button></div>}
    {!data && !error && <p role="status">Loading platform configuration…</p>}
    {data && !error && (section === "plans" ? <div className="am-stack"><p className="am-info">Limit changes affect future render reservations. Existing usage is preserved. Paddle prices are unchanged. Storyboard templates currently support up to 60 seconds.</p><div className="am-grid">{(data.plans || []).map(plan => <PlanFormWrapper key={plan.id + String(plan.rendersPerMonth) + String(plan.maxSeconds)} item={plan} saved={saved} />)}</div></div> :
    section === "settings" ? <SettingsForm key={refresh} item={data.settings} onSuccess={saved} /> :
    section === "master-data" ? <MasterForm key={refresh} data={data} onSuccess={saved} /> : <Other data={data} section={section} />)}
  </div>;
}
function PlanFormWrapper({ item, saved }) { return <PlanForm item={item} onSuccess={saved}/>; }
