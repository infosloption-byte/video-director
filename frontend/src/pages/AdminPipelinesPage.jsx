import { useCallback, useEffect, useMemo, useState } from "react";
import "./AdminPipelinesPage.css";

const BASE = "/api/platform-admin/pipelines";
async function request(path = "", method = "GET", data) {
  const response = await fetch(BASE + path, {
    method, credentials: "include", cache: "no-store",
    ...(data === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error([body.error || "Pipeline request failed.", ...(body.details || [])].join(" "));
  return body;
}
function Status({ value }) {
  return <span className={"ap-status ap-status--" + value}>{value}</span>;
}
function Stage({ stage, adapters, value, onChange, locked }) {
  const candidates = adapters.filter(adapter => adapter.capability === stage.key);
  return <section className="ap-stage" aria-label={stage.label}>
    <div className="ap-stage-heading"><div><h3>{stage.label}</h3><p>{stage.description}</p></div>{locked && <span className="ap-locked">Required</span>}</div>
    <div className="ap-models" role="group" aria-label={stage.label + " provider options"}>
      {candidates.map(adapter => <button key={adapter.id} type="button"
        className={"ap-model " + (value === adapter.id ? "selected" : "")}
        disabled={locked || !adapter.available || !onChange}
        aria-pressed={value === adapter.id}
        onClick={() => onChange?.(adapter.id)}>
        <span className="ap-model-main"><span className="ap-radio" aria-hidden="true"/><strong>{adapter.label}</strong></span>
        <span className="ap-provider">{adapter.provider} · {adapter.available ? (adapter.configured ? "Connected adapter" : "Needs credentials") : "Planned / unavailable"}</span>
      </button>)}
    </div>
  </section>;
}
export default function AdminPipelinesPage() {
  const [snapshot, setSnapshot] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [definition, setDefinition] = useState(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [validation, setValidation] = useState(null);
  const refresh = useCallback(async () => {
    const [pipelines, options] = await Promise.all([request(), request("/catalog")]);
    setSnapshot(pipelines);
    setCatalog(options);
    setSelectedId(previous => pipelines.pipelines.some(p => p.id === previous)
      ? previous : (pipelines.pipelines.find(p => p.versions.some(v => v.id === pipelines.activeVersionId))?.id || pipelines.pipelines[0]?.id || ""));
  }, []);
  useEffect(() => {
    let live = true;
    Promise.all([request(), request("/catalog")]).then(([pipelines, options]) => {
      if (!live) return;
      setSnapshot(pipelines); setCatalog(options);
      setSelectedId(pipelines.pipelines.find(p => p.versions.some(v => v.id === pipelines.activeVersionId))?.id || pipelines.pipelines[0]?.id || "");
      setError("");
    }).catch(e => { if (live) setError(e.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  const pipelines = useMemo(() => snapshot?.pipelines || [], [snapshot]);
  const pipeline = pipelines.find(p => p.id === selectedId);
  useEffect(() => {
    const latest = pipeline?.versions?.[0];
    if (!pipeline) { setSelectedVersionId(""); return; }
    setSelectedVersionId(previous => pipeline.versions.some(v => v.id === previous) ? previous : latest?.id || "");
  }, [pipeline]);
  const version = pipeline?.versions?.find(v => v.id === selectedVersionId);
  useEffect(() => {
    setDefinition(version?.definition ? JSON.parse(JSON.stringify(version.definition)) : null);
    setValidation(null);
  }, [version?.id, version?.definition]);
  const editable = version?.status === "draft";
  const active = snapshot?.activeVersionId === version?.id;
  function changeAdapter(stageKey, adapterId) {
    setDefinition(before => ({
      ...before, stages: before.stages.map(stage => stage.key === stageKey ? { ...stage, adapterId } : stage),
    }));
    setValidation(null);
  }
  async function action(task) {
    setBusy(true); setError(""); setNotice("");
    try { await task(); await refresh(); }
    catch (e) { setError(e.message || "Unable to update pipeline."); }
    finally { setBusy(false); }
  }
  const create = event => { event.preventDefault(); void action(async () => {
    const result = await request("", "POST", { name, description });
    setSelectedId(result.pipeline.id); setSelectedVersionId(result.pipeline.versions[0].id);
    setName(""); setDescription(""); setNotice("Pipeline draft created.");
  }); };
  const makeDraft = () => void action(async () => {
    const result = await request("/" + pipeline.id + "/drafts", "POST");
    setSelectedVersionId(result.version.id); setNotice("New draft version created.");
  });
  const save = () => void action(async () => {
    const result = await request("/" + pipeline.id + "/versions/" + version.id, "PUT", { definition });
    setValidation(result.validation); setNotice("Draft saved.");
  });
  async function validate() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await request("/" + pipeline.id + "/versions/" + version.id + "/validate", "POST", { definition });
      setValidation(result.validation);
      setNotice(result.validation.valid ? "Pipeline definition is valid." : "Validation found issues.");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const publish = () => void action(async () => {
    await request("/" + pipeline.id + "/versions/" + version.id + "/publish", "POST");
    setNotice("Version published. Activate it to use it for new projects.");
  });
  const activate = () => void action(async () => {
    await request("/" + pipeline.id + "/versions/" + version.id + "/activate", "POST");
    setNotice("Global active pipeline changed. Existing projects keep their assigned versions.");
  });
  return <div className="ap-page">
    <header className="ap-header"><div><span className="eyebrow">Voxora / AI Infrastructure</span><h1>AI Pipelines</h1><p>Manage ordered production stages, adapter compatibility, versions and the single active pipeline.</p></div>
      <button type="button" className="ap-outline" disabled={busy || loading} onClick={() => void action(async () => { setNotice("Pipeline list refreshed."); })}>Refresh</button>
    </header>
    <div className="ap-banner"><strong>Foundation release</strong> — only existing Voxora adapters can be published. Grok and GPU models remain unavailable until their execution adapters are implemented. Pipeline versions are assigned to new projects, but provider dispatch is still handled by the current production services.</div>
    {notice && <p className="ap-notice" role="status">{notice}</p>}
    {error && <p className="ap-error" role="alert">{error}</p>}
    {loading && <p role="status">Loading pipelines…</p>}
    {snapshot && catalog && <div className="ap-layout">
      <aside className="ap-sidebar" aria-label="Saved pipelines">
        <h2>Saved pipelines</h2>
        {pipelines.map(p => {
          const activeHere = p.versions.some(v => v.id === snapshot.activeVersionId);
          return <button key={p.id} type="button" className={"ap-pipeline-choice " + (selectedId === p.id ? "chosen" : "")}
            onClick={() => { setSelectedId(p.id); setSelectedVersionId(""); }}>
            <strong>{p.name}</strong><small>{p.versions.length} version(s)</small>{activeHere && <Status value="active"/>}
          </button>;
        })}
        <form className="ap-create" onSubmit={create}>
          <h3>New pipeline</h3>
          <label htmlFor="ap-name">Name</label>
          <input id="ap-name" minLength={3} maxLength={120} required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Premium Cinematic"/>
          <label htmlFor="ap-desc">Description</label>
          <textarea id="ap-desc" rows={3} maxLength={500} value={description} onChange={e => setDescription(e.target.value)} placeholder="What this pipeline is for"/>
          <button type="submit" className="ap-primary" disabled={busy}>Create draft</button>
        </form>
      </aside>
      <div className="ap-workbench">
        {!pipeline ? <div className="ap-empty">Select a pipeline to view its versions.</div> : <>
          <div className="ap-summary">
            <div><h2>{pipeline.name}</h2><p>{pipeline.description || "No description"}</p></div>
            <div className="ap-version-list" aria-label="Pipeline versions">
              {pipeline.versions.map(v => <button type="button" key={v.id} className={v.id === version?.id ? "selected" : ""}
                onClick={() => setSelectedVersionId(v.id)}>
                v{v.version} · {v.status}{v.id === snapshot.activeVersionId ? " · ACTIVE" : ""}
              </button>)}
            </div>
          </div>
          {version && <>
            <div className="ap-version-bar">
              <div className="ap-version-status"><strong>Version {version.version}</strong><Status value={active ? "active" : version.status}/>{editable && <span>Draft is editable</span>}</div>
              <div className="ap-actions">
                <button type="button" className="ap-outline" disabled={busy} onClick={validate}>Validate</button>
                {editable && <><button type="button" className="ap-outline" disabled={busy} onClick={save}>Save draft</button><button type="button" className="ap-primary" disabled={busy} onClick={publish}>Publish</button></>}
                {version.status === "published" && <><button type="button" className="ap-outline" disabled={busy} onClick={makeDraft}>New draft</button><button type="button" className="ap-primary" disabled={busy || active} onClick={activate}>{active ? "Active" : "Activate globally"}</button></>}
              </div>
            </div>
            {validation && <div className={validation.valid ? "ap-notice" : "ap-error"} role="status">
              <strong>{validation.valid ? "Definition valid" : "Validation failed"}</strong>
              {validation.errors?.map(x => <div key={x}>{x}</div>)}
              {validation.warnings?.map(x => <div key={x}>{x}</div>)}
            </div>}
            <div className="ap-stages">
              {(catalog.stages || []).map((stage, i) =>
                <div key={stage.key} className="ap-stage-wrap">
                  <span className="ap-order">Stage {String(i + 1).padStart(2, "0")}</span>
                  <Stage stage={stage} adapters={catalog.adapters} locked={stage.locked || !editable}
                    value={definition?.stages?.find(entry => entry.key === stage.key)?.adapterId}
                    onChange={editable && !stage.locked ? adapterId => changeAdapter(stage.key, adapterId) : undefined}/>
                </div>)}
            </div>
          </>}
        </>}
      </div>
    </div>}
  </div>;
}
