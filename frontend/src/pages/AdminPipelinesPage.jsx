import { Link } from "react-router-dom";
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
function Stage({ stage, adapters, models, value, modelId, onChange, onModelChange, locked }) {
  const approvedModels = (models || []).filter(model =>
    model.enabled && model.verifiedCapabilities.includes(stage.key));
  const candidates = adapters.filter(adapter => adapter.capability === stage.key);
  return <section className="ap-stage" aria-label={stage.label}>
    <div className="ap-stage-heading"><div><h3>{stage.label}</h3><p>{stage.description}</p></div>{locked && <span className="ap-locked">Required</span>}</div>
    <div className="ap-models" role="group" aria-label={stage.label + " provider options"}>
      {candidates.map(adapter => <button key={adapter.id} type="button"
        className={"ap-model " + (value === adapter.id ? "selected" : "")}
        disabled={locked || !onChange}
        aria-pressed={value === adapter.id}
        onClick={() => onChange?.(adapter.id)}>
        <span className="ap-model-main"><span className="ap-radio" aria-hidden="true"/><strong>{adapter.label}</strong></span>
        <span className="ap-provider">{adapter.provider} · {adapter.available ? (adapter.configured ? "Connected adapter" : "Needs credentials") : "Planned / unavailable"}</span>
      </button>)}
    </div>
    {!stage.locked && ["research", "storyboard", "visuals", "speech"].includes(stage.key) && <div className="ap-pool-selection">
      <div className="ap-stage-heading"><div><h3>AI Model Pool selection</h3><p>Verified models from Admin Model Pool, shown for this stage's capabilities. Draft preview only; executable routing is not connected.</p></div><Link to="/admin/model-pool">Manage pool</Link></div>
      <div className="ap-models" role="group" aria-label={stage.label + " model pool"}>
        <button type="button" className={"ap-model " + (!modelId ? "selected" : "")} disabled={locked || !onModelChange}
          aria-pressed={!modelId} onClick={() => onModelChange?.(null)}><span className="ap-model-main"><span className="ap-radio"/>Default existing adapter</span></button>
        {approvedModels.map(model => <button type="button" key={model.id} className={"ap-model " + (model.id === modelId ? "selected" : "")}
          disabled={locked || !onModelChange} aria-pressed={model.id === modelId} onClick={() => onModelChange?.(model.id)}>
          <span className="ap-model-main"><span className="ap-radio"/><strong>{model.name}</strong></span>
          <span className="ap-provider">{model.hostingType} · {model.provider} · verified {stage.key}</span>
        </button>)}
      </div>
      {!approvedModels.length && <p className="ap-pool-empty">No verified pool models yet. Add a model and pass its {stage.key} capability test first.</p>}
      {modelId && <p className="ap-warning">Pool model assignments remain draft-only. Publishing this pipeline is blocked until a runtime adapter is integrated.</p>}
    </div>}
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
  const [testHistory, setTestHistory] = useState(null);
  const [selectedTestId, setSelectedTestId] = useState("");
  const [testRefresh, setTestRefresh] = useState(0);
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
  useEffect(() => {
    if (!pipeline?.id || !version?.id) { setTestHistory(null); return undefined; }
    const controller = new AbortController();
    setTestHistory(null);
    request("/" + pipeline.id + "/versions/" + version.id + "/sandbox-tests")
      .then(result => {
        if (!controller.signal.aborted) {
          setTestHistory(result);
          setSelectedTestId(previous => result.tests.some(test => test.id === previous) ? previous : result.tests[0]?.id || "");
        }
      })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [pipeline?.id, version?.id, version?.definition, testRefresh]);
  const unsaved = !!definition && !!version && JSON.stringify(definition) !== JSON.stringify(version.definition);
  const latestPass = (testHistory?.tests || []).some(test => test.current && test.passed);
  const selectedTest = (testHistory?.tests || []).find(test => test.id === selectedTestId);
  const editable = version?.status === "draft";
  const active = snapshot?.activeVersionId === version?.id;
  function changeModel(stageKey, modelId) {
    setDefinition(before => ({
      ...before,
      stages: before.stages.map(stage => stage.key !== stageKey ? stage :
        modelId ? { ...stage, modelId } : Object.fromEntries(Object.entries(stage).filter(([key]) => key !== "modelId"))),
    }));
    setValidation(null);
  }
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
  const sandbox = () => void action(async () => {
    if (unsaved) throw new Error("Save draft changes before running an admin sandbox test.");
    const result = await request("/" + pipeline.id + "/versions/" + version.id + "/sandbox-tests", "POST");
    setSelectedTestId(result.test.id);
    setTestRefresh(n => n + 1);
    setNotice(result.test.passed ? "Sandbox contract simulation passed. External providers were NOT called." : "Sandbox reported failures. Review the test results.");
  });
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
    <div className="ap-banner"><strong>Admin testing mode</strong> — sandbox runs validate sample input/output contracts only; no model API calls, real videos, billing or customer projects. You can design drafts with planned Grok/GPU adapters, but those stages cannot pass or publish until implemented. <strong>Production rollout is locked</strong> while we complete and test the pipeline architecture.</div>
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
                <button type="button" className="ap-outline" disabled={busy || unsaved} onClick={sandbox}>Run admin sandbox</button>
                {editable && <><button type="button" className="ap-outline" disabled={busy} onClick={save}>Save draft</button><button type="button" className="ap-primary" disabled={busy || !latestPass || unsaved || definition?.stages?.some(stage => stage.modelId)} onClick={publish} title={!latestPass ? "A passing sandbox run is required" : "Publish this tested version"}>Publish</button></>}
                {version.status === "published" && <><button type="button" className="ap-outline" disabled={busy} onClick={makeDraft}>New draft</button><button type="button" className="ap-primary" disabled={busy || active || (!catalog.workspaceRolloutEnabled && version.id !== "voxora-legacy-v1")} onClick={activate}>{active ? "Active" : !catalog.workspaceRolloutEnabled ? "Workspace rollout locked" : "Activate globally"}</button></>}
              </div>
            </div>
            {validation && <div className={validation.valid ? "ap-notice" : "ap-error"} role="status">
              <strong>{validation.valid ? "Definition valid" : "Validation failed"}</strong>
              {validation.errors?.map(x => <div key={x}>{x}</div>)}
              {validation.warnings?.map(x => <div key={x}>{x}</div>)}
            </div>}
            <section className="ap-tests" aria-label="Administrator sandbox test runs">
              <div className="ap-tests-head"><div><h3>Admin sandbox test runs</h3><p>Contract simulation only. No provider calls, generated media or workspace side effects. Passing these tests does not prove real AI output quality.</p></div><span className="ap-locked">{testHistory?.tests?.length || 0} recent</span></div>
              {unsaved && <p className="ap-error">Unsaved changes: save this draft before testing the persisted configuration.</p>}
              {testHistory?.tests?.length ? <>
                <div className="ap-test-picker" role="group" aria-label="Saved sandbox test runs">
                  {testHistory.tests.map(test => <button key={test.id} type="button" className={selectedTestId === test.id ? "selected" : ""}
                    onClick={() => setSelectedTestId(test.id)}>
                    {test.passed ? "PASS" : "FAIL"} · {new Date(test.createdAt).toLocaleString()}{!test.current ? " · stale" : ""}
                  </button>)}
                </div>
                {selectedTest && <div className="ap-test-report">
                  <div className="ap-tests-head"><strong>{selectedTest.passed ? "Configuration simulation passed" : "Configuration simulation failed"}</strong><Status value={selectedTest.current ? "current" : "stale"} /></div>
                  <p>{selectedTest.report?.summary?.passedStages ?? 0} of {selectedTest.report?.summary?.checkedStages ?? 0} stage contracts passed. Provider calls: {selectedTest.report?.actualProviderCalls ?? 0}. Workspace changes: {selectedTest.report?.workspaceMutations ?? 0}.</p>
                  {(selectedTest.report?.stages || []).map(step => <div className="ap-test-step" key={step.stage}>
                    <span className={"ap-step-dot " + (step.status === "passed" ? "ok" : "bad")}>{step.status === "passed" ? "✓" : "!"}</span>
                    <div><strong>{step.label}</strong><small>{step.adapterId || "No adapter"} · {step.status}</small>
                      {step.status !== "passed" && (step.notes || []).map(note => <small key={note}>{note}</small>)}
                    </div>
                  </div>)}
                  {(selectedTest.report?.warnings || []).map(warning => <p key={warning} className="ap-warning">{warning}</p>)}
                </div>}
              </> : <div className="ap-empty">No sandbox runs yet. Save a draft and run the admin sandbox to test all stage contracts.</div>}
            </section>
            <div className="ap-stages">
              {(catalog.stages || []).map((stage, i) =>
                <div key={stage.key} className="ap-stage-wrap">
                  <span className="ap-order">Stage {String(i + 1).padStart(2, "0")}</span>
                  <Stage stage={stage} adapters={catalog.adapters} models={catalog.modelPool} locked={stage.locked || !editable}
                    value={definition?.stages?.find(entry => entry.key === stage.key)?.adapterId}
                    modelId={definition?.stages?.find(entry => entry.key === stage.key)?.modelId}
                    onModelChange={editable && !stage.locked ? modelId => changeModel(stage.key, modelId) : undefined}
                    onChange={editable && !stage.locked ? adapterId => changeAdapter(stage.key, adapterId) : undefined}/>
                </div>)}
            </div>
          </>}
        </>}
      </div>
    </div>}
  </div>;
}
