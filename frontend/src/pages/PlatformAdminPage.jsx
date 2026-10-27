import { useCallback, useEffect, useState } from "react";
import "./PlatformAdminPage.css";

const VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "projects", label: "Projects" },
  { id: "subscriptions", label: "Subscriptions" },
  { id: "activity", label: "Activity" },
];
const numeric = (n) => Number(n || 0).toLocaleString();
function date(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}
function Status({ value, good }) {
  return <span className={`pa-pill ${good ? "pa-pill--good" : ""}`}>{String(value || "unknown").replaceAll("_", " ")}</span>;
}
function Stat({ title, value, detail }) {
  return <div className="pa-stat"><span>{title}</span><strong>{numeric(value)}</strong>{detail && <small>{detail}</small>}</div>;
}
function Empty({ label }) { return <div className="pa-empty">{label}</div>; }
function DataTable({ headings, rows, empty }) {
  if (!rows.length) return <Empty label={empty} />;
  return <div className="pa-table-scroll" tabIndex={0} aria-label="Scrollable monitoring table">
    <table className="pa-table"><thead><tr>{headings.map((item) => <th key={item} scope="col">{item}</th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.key}>{row.cells.map((cell, idx) => <td key={idx}>{cell}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}

function Overview({ data }) {
  const t = data.totals || {};
  const queues = data.queues || {};
  const integrations = data.integrations || [];
  return <div className="pa-panel-stack">
    <section className="pa-stats" aria-label="Platform totals">
      <Stat title="Registered users" value={t.users} detail={`${numeric(t.newUsers7d)} joined in 7 days`} />
      <Stat title="Verified accounts" value={t.verifiedUsers} detail="Email verified" />
      <Stat title="Projects" value={t.projects} detail={`${numeric(t.completedProjects)} have a final storyboard render`} />
      <Stat title="Active subscriptions" value={t.activeSubscriptions} detail="Active or trialing" />
      <Stat title="Monthly render credits used" value={t.rendersThisMonth} detail={t.month || "Current month (UTC)"} />
      <Stat title="Stored media assets" value={t.mediaAssets} detail={`${numeric(t.voiceProfiles)} saved voice profiles`} />
    </section>
    <div className="pa-overview-grid">
      <section className="pa-card"><h2>Project pipeline</h2><p>Projects grouped by their current stage.</p>
        {(data.projectsByStatus || []).length ? <div className="pa-groups">{data.projectsByStatus.map((item) => <div className="pa-group" key={item.status}><span>{item.status}</span><strong>{numeric(item.count)}</strong></div>)}</div> : <Empty label="No projects recorded." />}
      </section>
      <section className="pa-card"><h2>Subscriptions</h2><p>Recorded Paddle subscription states, by plan.</p>
        {(data.subscriptions || []).length ? <div className="pa-groups">{data.subscriptions.map((item) => <div className="pa-group" key={item.plan + item.status}><span>{item.plan} <small>· {item.status}</small></span><strong>{numeric(item.count)}</strong></div>)}</div> : <Empty label="No subscriptions recorded." />}
      </section>
    </div>
    <section className="pa-card"><h2>Video render queues</h2><p>Live Redis/BullMQ job counts. These are final rendering jobs, not GPU generation jobs.</p>
      <div className="pa-queues">{[["Storyboard", queues.storyboard], ["Advanced editor", queues.editor]].map(([name, state]) => <div className="pa-queue" key={name}><div className="pa-section-head"><strong>{name}</strong><Status value={state?.available ? "Connected" : "Unavailable"} good={state?.available} /></div>
        {state?.available ? <div className="pa-queue-values">{["waiting", "active", "completed", "failed", "delayed"].map((key) => <div key={key}><strong>{numeric(state.counts?.[key])}</strong><span>{key}</span></div>)}</div> : <p>{state?.error || "Queue status unavailable"}</p>}
      </div>)}</div>
    </section>
    <section className="pa-card"><h2>Provider configuration</h2><p>Configured means credentials or an endpoint are present. It does not verify provider availability, model health or paid credits.</p>
      <div className="pa-integrations">{integrations.map((item) => <div className="pa-integration" key={item.id}><span><strong>{item.name}</strong><small>{item.capability}</small></span><Status value={item.configured ? "Configured" : "Not configured"} good={item.configured} /></div>)}</div>
    </section>
    <div className="pa-overview-grid">
      <section className="pa-card"><h2>Recent platform activity</h2><p>Project events across customer workspaces.</p>
        {(data.recentActivity || []).length ? <div className="pa-feed">{data.recentActivity.map((event) => <div key={event.id}><strong>{event.action}</strong><small>{date(event.createdAt)} · Project {event.projectId?.slice(0, 8)}</small></div>)}</div> : <Empty label="No project activity recorded." />}
      </section>
      <section className="pa-card"><h2>Administration audit</h2><p>Privilege bootstrap events. No admin role-management endpoints are enabled.</p>
        {(data.adminAudit || []).length ? <div className="pa-feed">{data.adminAudit.map((event) => <div key={event.id}><strong>{event.action}</strong><small>{date(event.createdAt)} · User {event.targetUserId?.slice(0, 8)}</small></div>)}</div> : <Empty label="No admin audit events recorded." />}
      </section>
    </div>
    <section className="pa-card"><h2>Recent billing webhooks</h2><p>Most recently recorded signed subscription events. This is not a revenue ledger.</p>
      {(data.webhookEvents || []).length ? <div className="pa-feed pa-feed--columns">{data.webhookEvents.map((event, index) => <div key={event.eventType + index}><strong>{event.eventType}</strong><small>{date(event.occurredAt)}</small></div>)}</div> : <Empty label="No billing webhook events recorded." />}
    </section>
  </div>;
}

function Records({ view, items }) {
  if (view === "users") return <DataTable headings={["User", "Role", "Verified", "Plan", "Subscription", "Joined"]} empty="No users match this search." rows={items.map((u) => ({ key: u.id, cells: [
    <span className="pa-primary"><strong>{u.displayName || "Unnamed user"}</strong><small>{u.email}</small></span>, <Status value={u.role} good={u.role === "platform_admin"} />,
    u.emailVerifiedAt ? "Yes" : "No", u.subscription?.plan || "free", <Status value={u.subscription?.status || "free"} good={u.subscription?.status === "active"} />, date(u.createdAt),
  ] }))} />;
  if (view === "projects") return <DataTable headings={["Project", "Owner", "Stage", "Scenes", "Media", "Rendered", "Created"]} empty="No projects match this search." rows={items.map((p) => ({ key: p.id, cells: [
    <span className="pa-primary"><strong>{p.title || "Untitled project"}</strong><small>{p.id.slice(0, 12)}</small></span>, p.ownerEmail || "Unknown", <Status value={p.status} good={p.rendered} />, numeric(p.scenes), numeric(p.media), p.rendered ? "Yes" : "No", date(p.createdAt),
  ] }))} />;
  if (view === "subscriptions") return <DataTable headings={["Customer", "Plan", "Status", "Renewal/period end", "Cancel scheduled", "Updated"]} empty="No subscriptions match this search." rows={items.map((s) => ({ key: s.id, cells: [
    <span className="pa-primary"><strong>{s.user?.displayName || "Customer"}</strong><small>{s.user?.email}</small></span>, s.plan, <Status value={s.status} good={s.status === "active"} />, date(s.periodEnd), s.cancelAtPeriodEnd ? "Yes" : "No", date(s.updatedAt),
  ] }))} />;
  return <DataTable headings={["Event", "Project", "Actor", "Time"]} empty="No activity recorded." rows={items.map((a) => ({ key: a.id, cells: [
    <strong>{a.action}</strong>, <span className="pa-primary"><strong>{a.project?.title || "Untitled project"}</strong><small>{a.projectId.slice(0, 12)}</small></span>, a.user?.email || "System", date(a.createdAt),
  ] }))} />;
}

export default function PlatformAdminPage() {
  const [view, setView] = useState("overview");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal) => {
    const params = new URLSearchParams();
    if (view !== "overview") {
      params.set("page", String(page));
      params.set("limit", "20");
      if (appliedSearch && view !== "activity") params.set("q", appliedSearch);
    }
    const url = "/api/platform-admin/" + view + (params.size ? "?" + params : "");
    const response = await fetch(url, { credentials: "include", cache: "no-store", signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Monitoring request failed (HTTP ${response.status}).`);
    return body;
  }, [view, page, appliedSearch]);

  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      try {
        const data = await load(controller.signal);
        if (!controller.signal.aborted) { setResult(data); setError(""); }
      } catch (err) {
        if (!controller.signal.aborted) { setResult(null); setError(err.message || "Unable to load monitoring."); }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void run();
    return () => controller.abort();
  }, [load, nonce]);

  function changeView(next) {
    if (next === view) return;
    setView(next); setPage(1); setSearch(""); setAppliedSearch(""); setResult(null); setLoading(true);
  }
  function refresh() { setLoading(true); setNonce((n) => n + 1); }

  const records = result?.items || [];
  const totalPages = Math.max(1, Math.ceil(Number(result?.total || 0) / Number(result?.pageSize || 20)));
  return <div className="pa-page">
    <header className="pa-header"><div><span className="eyebrow">Voxora / Administration</span><h1>Platform monitor</h1><p>Read-only monitoring for users, revenue operations, projects and AI services.</p></div>
      <button type="button" className="pa-refresh" onClick={refresh} disabled={loading} aria-label="Refresh platform monitoring">{loading ? "Loading…" : "↻ Refresh"}</button></header>
    <nav className="pa-tabs" aria-label="Platform administration sections">{VIEWS.map((item) => <button type="button" key={item.id} aria-current={view === item.id ? "page" : undefined} className={view === item.id ? "pa-active" : ""} onClick={() => changeView(item.id)}>{item.label}</button>)}</nav>
    {view !== "overview" && <form className="pa-tools" onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedSearch(search.trim().slice(0, 100)); setLoading(true); }}>
      <label htmlFor="pa-search">{view === "activity" ? "Platform activity history" : "Search " + view}</label>
      {view !== "activity" && <><input id="pa-search" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={100} placeholder={view === "projects" ? "Project title" : "Customer name or email"} autoComplete="off" /><button type="submit">Search</button></>}
    </form>}
    {error && <div role="alert" className="pa-error"><strong>Monitoring unavailable.</strong> {error} <button type="button" onClick={refresh}>Retry</button></div>}
    {loading && <div className="pa-loading" role="status">Loading platform data…</div>}
    {!loading && !error && result && (view === "overview" ? <Overview data={result} /> : <section className="pa-card">
      <div className="pa-section-head"><div><h2>{VIEWS.find((item) => item.id === view)?.label}</h2><p>{numeric(result.total)} matching records · Page {page} of {totalPages}</p></div><span className="pa-readonly">Read-only</span></div>
      <Records view={view} items={records} />
      <div className="pa-pages"><button type="button" disabled={page <= 1} onClick={() => { setPage((p) => p - 1); setLoading(true); }}>Previous</button><span>{page} / {totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => { setPage((p) => p + 1); setLoading(true); }}>Next</button></div>
    </section>)}
    {!loading && !error && result && <p className="pa-updated">Snapshot received {date(result.collectedAt || new Date().toISOString())}. No customer data or platform settings can be changed from this console.</p>}
  </div>;
}
