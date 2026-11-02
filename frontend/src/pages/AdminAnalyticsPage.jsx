import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "./PlatformAdminPage.css";
import "./AdminAnalyticsPage.css";
import AdminMonitoringDetail from "./AdminMonitoringDetail.jsx";

const TABS = [
  { id: "overview", name: "Operations", path: "/admin/analytics" },
  { id: "pipeline", name: "Pipeline timing", path: "/admin/analytics/pipeline" },
  { id: "users", name: "User usage", path: "/admin/analytics/users" },
  { id: "costs", name: "Provider costs", path: "/admin/analytics/costs" },
  { id: "infrastructure", name: "Server resources", path: "/admin/analytics/infrastructure" },
  { id: "economics", name: "Generation economics", path: "/admin/analytics/economics" },
];

const number = (v) => Number(v || 0).toLocaleString();
const duration = (ms) => ms == null ? "—" : ms >= 60000 ? (ms / 60000).toFixed(1) + " min" : (ms / 1000).toFixed(1) + " sec";
const money = (v) => v == null ? "Not measured" : "$" + Number(v).toFixed(4);
const time = (v) => v ? new Date(v).toLocaleString() : "—";
const title = (s) => String(s || "Unknown").replaceAll("_", " ").replaceAll(".", " · ");
function Metric({ label, value, help }) {
  return <div className="an-metric"><span>{label}</span><strong>{value}</strong><small>{help}</small></div>;
}
function Warning({ children }) { return <div className="an-notice">{children}</div>; }
function SimpleTable({ columns, rows, empty = "No records for this period." }) {
  return <div className="an-table-wrap"><table className="an-table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
    <tbody>{rows?.length ? rows.map((row) => <tr key={row.key}>{row.cells.map((cell, i) => <td key={i}>{cell}</td>)}</tr>) :
      <tr><td colSpan={columns.length} className="an-empty">{empty}</td></tr>}</tbody></table></div>;
}
const api = async (url, signal) => {
  const response = await fetch(url, { credentials: "include", cache: "no-store", signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Analytics service unavailable.");
  return data;
};

function LiveOperations() {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let timer = null;
    const fetchLive = async () => {
      try {
        const response = await fetch("/api/platform-admin/analytics/live", { credentials: "include", cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Live queue unavailable");
        if (active) { setSnapshot(body); setError(""); }
      } catch (e) {
        if (active) setError(e.message || "Live queue unavailable");
      } finally {
        if (active) timer = window.setTimeout(fetchLive, 20000);
      }
    };
    void fetchLive();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, []);
  return <section className="pa-card">
    <div className="pa-section-head"><div><h2>Live research and render queue</h2>
      <p>Lightweight status refresh every 20 seconds. Final MP4 rendering currently runs on Lightsail.</p></div>
      <span className="pa-readonly">{snapshot ? "Updated " + time(snapshot.collectedAt) : "Loading"}</span>
    </div>
    {error && <p role="status" className="an-muted">Live status unavailable: {error}</p>}
    {snapshot && <>
      <div className="an-grid">
        {Object.values(snapshot.queues || {}).map(q =>
          <div key={q.type} className="an-live-queue"><h3>{title(q.type)} rendering</h3>
            {q.available ? <p>{number(q.counts?.active)} active · {number(q.counts?.waiting)} waiting · {number(q.counts?.failed)} failed</p>
              : <p>{q.reason || "Unavailable"}</p>}
            {(q.jobs || []).map(job => <div className="an-live-job" key={job.jobId}>
              <span>{job.state} · {title(job.stage)} · {job.progress.toFixed(1)}%</span>
              <div className="an-bar"><i style={{ width: job.progress + "%" }} /></div>
              <small>Job {job.jobId.slice(0, 18)} · Queued {time(job.queuedAt)}</small>
            </div>)}
          </div>)}
      </div>
      <p className="an-muted">Research projects flagged active: {number(snapshot.researching?.length || 0)}
        {(snapshot.researching || []).map(p => <span key={p.projectId}> · {p.title || p.projectId.slice(0, 8)}</span>)}
      </p>
    </>}
  </section>;
}

function Overview({ report }) {
  const t = report.totals;
  const stageCounts = Object.entries((report.stages || []).reduce((all, x) => {
    all[x.stage] = (all[x.stage] || 0) + x.count; return all;
  }, {}));
  const max = Math.max(1, ...stageCounts.map(x => x[1]));
  return <>
    <LiveOperations />
    <div className="an-metrics">
      <Metric label="Projects started" value={number(t.newProjects)} help="Created in selected period" />
      <Metric label="Research sessions" value={number(t.researchSessions)} help="Historical database records" />
      <Metric label="Projects with MP4" value={number(t.projectsWithRenderUrl)} help="Created in selected period" />
      <Metric label="Render credits" value={number(t.renderCredits)} help="Recorded reservations" />
      <Metric label="Timed operations" value={number(t.generationOperations)} help="New telemetry after deployment" />
      <Metric label="Verified provider spend" value={money(t.verifiedCostUsd)} help={t.costMeasuredOperations + " operations with verified cost"} />
    </div>
    <div className="an-grid">
      <section className="pa-card"><h2>Generation pipeline</h2><p>Measured operations by stage; older runs without telemetry are excluded.</p>
        {stageCounts.length ? stageCounts.map(([name, count]) => <div className="an-bar-row" key={name}>
          <span>{title(name)}</span><div className="an-bar"><i style={{ width: (count / max * 100) + "%" }} /></div><strong>{number(count)}</strong>
        </div>) : <p className="an-muted">No measured operations yet. Research and render timing begins after deploying the instrumented backend.</p>}
      </section>
      <section className="pa-card"><h2>Research status</h2><p>Existing research session records, including historical entries.</p>
        {(report.researchByStatus || []).length ? report.researchByStatus.map(x => <div className="an-row" key={x.status}>
          <span>{title(x.status)}</span><strong>{number(x.count)}</strong>
        </div>) : <p className="an-muted">No research sessions in this period.</p>}
      </section>
    </div>
    <section className="pa-card"><h2>Recent project flow</h2><p>Actual projects created within the selected time window.</p>
      <SimpleTable columns={["Project", "User", "Status", "Scenes", "Output seconds", "MP4", "Created"]}
        rows={(report.recentProjects || []).map(p => ({ key: p.id, cells: [
          p.title || "Untitled", p.user?.email || "—", title(p.status), number(p.sceneCount),
          p.durationSeconds == null ? "—" : p.durationSeconds + "s", p.hasRender ? "Ready" : "Not yet", time(p.createdAt),
        ] }))} />
    </section>
  </>;
}
function Pipeline({ report }) {
  return <>
    <Warning>Timing measurements reflect actual observed execution duration. Research and Remotion rendering record full jobs; synchronous project operations record API wall time, which can include external service latency. These are not interchangeable with GPU utilization.</Warning>
    <section className="pa-card"><h2>Stage durations and outcomes</h2><p>Source: generation traces, beginning with this deployment.</p>
      <SimpleTable columns={["Stage", "Result", "Operations", "Average duration", "Total execution time", "Tokens in / out", "Verified cost"]}
        rows={(report.stages || []).map(s => ({ key: s.stage + ":" + s.status, cells: [
          title(s.stage), title(s.status), number(s.count), duration(s.averageDurationMs),
          duration(s.totalDurationMs), number(s.inputTokens) + " / " + number(s.outputTokens),
          money(s.verifiedCostUsd),
        ] }))} />
    </section>
    <section className="pa-card"><h2>Recent step executions</h2><p>Execution traces include failed operations and retries when recorded.</p>
      <SimpleTable columns={["Action", "Outcome", "User", "Model/provider", "Elapsed", "Time"]}
        rows={(report.recentOperations || []).map(o => ({ key: o.id, cells: [
          title(o.operation), title(o.status), o.user?.email || "—",
          [o.provider, o.model].filter(Boolean).join(" / ") || "Not recorded", duration(o.durationMs), time(o.createdAt),
        ] }))} />
    </section>
  </>;
}
function Users({ report }) {
  return <section className="pa-card"><h2>Highest usage users</h2><p>Based on projects, render reservations and measured operations in the selected period. Click a user for details.</p>
    <SimpleTable columns={["Customer", "Projects", "Render credits", "Timed operations", "Execution time", "Verified spend", "Details"]}
      rows={(report.users || []).map(u => ({ key: u.userId, cells: [
        u.user?.email || u.userId, number(u.newProjects), number(u.renderCredits),
        number(u.operations), duration(u.totalDurationMs),
        money(u.measuredCostUsd), <Link to={"/admin/analytics/user/" + encodeURIComponent(u.userId)}>Open user report</Link>,
      ] }))} />
    <p className="an-muted">Older activity without generation traces is not attributed as measured execution time. See the Projects and Activity pages for historical records.</p>
  </section>;
}
function Costs({ report }) {
  const t = report.totals;
  return <>
    <div className="an-metrics">
      <Metric label="Verified costs" value={money(t.verifiedCostUsd)} help="Only verifiable provider amounts" />
      <Metric label="Cost-recorded operations" value={number(t.costMeasuredOperations)} help="Actual spend available" />
      <Metric label="Unknown-cost operations" value={number(t.costUnmeasuredOperations)} help="Not equivalent to free" />
    </div>
    <Warning>Cost attribution is not yet complete. No provider price sheet or token estimates are treated as invoices. GPU EC2, Lightsail compute, network, disk, stock footage, and third-party invoices are not included unless explicitly recorded and verified.</Warning>
    <section className="pa-card"><h2>Providers and models</h2><p>Number of measured operations and confirmed cost coverage.</p>
      <SimpleTable columns={["Provider", "Model", "Operations", "Measured execution time", "Verified cost"]}
        rows={(report.providers || []).map((p, i) => ({ key: p.provider + p.model + i,
          cells: [p.provider, p.model, number(p.operations), duration(p.totalDurationMs), money(p.measuredCostUsd)] }))} />
    </section>
  </>;
}
function UserDetails({ userId, days, nonce }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true });
    api("/api/platform-admin/analytics/users/" + encodeURIComponent(userId) + "?days=" + days, controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({ data }); })
      .catch(error => { if (!controller.signal.aborted) setState({ error: error.message }); });
    return () => controller.abort();
  }, [userId, days, nonce]);
  if (state.loading) return <p role="status">Loading customer activity…</p>;
  if (state.error) return <p role="alert" className="pa-error">{state.error}</p>;
  const d = state.data;
  return <>
    <section className="pa-card"><h2>{d.user.displayName || d.user.email}</h2><p>{d.user.email} · {d.user.subscription?.plan || "free"} / {d.user.subscription?.status || "no subscription"}</p>
      <div className="an-metrics"><Metric label="Projects" value={number(d.counts.projects)} help="Latest 100 shown" />
        <Metric label="Research sessions" value={number(d.counts.research)} help="Within period" />
        <Metric label="Render credits" value={number(d.counts.renders)} help="Within period" />
        <Metric label="Voice profiles" value={number(d.counts.voices)} help="Current total" /></div>
    </section>
    <section className="pa-card"><h2>Execution history</h2>
      <SimpleTable columns={["Stage", "Action", "Result", "Duration", "Provider", "Cost", "Time"]}
        rows={d.traces.map(x => ({ key: x.id, cells: [title(x.stage), title(x.operation), x.status,
          duration(x.durationMs), [x.provider,x.model].filter(Boolean).join(" / ") || "—",
          money(x.costUsd), time(x.createdAt)] }))} />
    </section>
    <section className="pa-card"><h2>Projects</h2>
      <SimpleTable columns={["Project", "Status", "Scenes", "Length", "Rendered", "Created"]}
        rows={d.projects.map(p => ({ key: p.id, cells: [p.title || p.id, title(p.status),
          number(p.scenes), p.seconds == null ? "—" : p.seconds + "s",
          p.rendered ? "Yes" : "No", time(p.createdAt)] }))} />
    </section>
  </>;
}

export default function AdminAnalyticsPage({ view = "overview" }) {
  const { userId } = useParams();
  const [days, setDays] = useState(30);
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(() => { setLoading(true); setNonce(n => n + 1); }, []);
  useEffect(() => {
    if (userId || view === "infrastructure" || view === "economics") return undefined;
    const controller = new AbortController();
    setLoading(true);
    api("/api/platform-admin/analytics?days=" + days, controller.signal).then(data => {
      if (!controller.signal.aborted) { setResult(data); setError(""); }
    }).catch(e => { if (!controller.signal.aborted) { setResult(null); setError(e.message); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [days, nonce, userId, view]);
  return <div className="pa-page an-page">
    <header className="pa-header"><div><span className="eyebrow">Voxora / Operational intelligence</span>
      <h1>{userId ? "Customer usage" : TABS.find(x => x.id === view)?.name || "Operations analytics"}</h1>
      <p>Research → storyboard → narration → Remotion export. Database-backed measurement and traceability.</p>
    </div><button type="button" className="pa-refresh" onClick={refresh}>↻ Refresh</button></header>
    <nav className="an-tabs" aria-label="Operational reports">{TABS.map(tab =>
      <Link key={tab.id} to={tab.path} className={view === tab.id && !userId ? "is-active" : ""}>{tab.name}</Link>)}</nav>
    <div className="an-filters"><span>Reporting window</span>{[7, 30, 90].map(d =>
      <button type="button" key={d} className={d === days ? "is-active" : ""} onClick={() => setDays(d)}>{d} days</button>)}
      <span className="an-muted">UTC timestamps · Refresh for latest</span>
    </div>
    {userId ? <UserDetails userId={userId} days={days} nonce={nonce} /> :
      (view === "infrastructure" || view === "economics") ? <AdminMonitoringDetail view={view} days={days} nonce={nonce} /> :
      loading ? <p role="status" className="pa-loading">Loading operational data…</p> :
      error ? <p role="alert" className="pa-error">{error} <button onClick={refresh}>Retry</button></p> :
      result ? <>
        {view === "overview" && <Overview report={result} />}
        {view === "pipeline" && <Pipeline report={result} />}
        {view === "users" && <Users report={result} />}
        {view === "costs" && <Costs report={result} />}
        <footer className="an-footer">Captured {time(result.collectedAt)}. {result.definitions.historical} {result.definitions.costs}</footer>
      </> : null}
  </div>;
}
