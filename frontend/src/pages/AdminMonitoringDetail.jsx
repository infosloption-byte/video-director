import { useEffect, useState } from "react";
import "./AdminAnalyticsPage.css";

const n = x => Number(x || 0).toLocaleString();
const usd = x => x == null ? "Unknown" : "$" + Number(x).toFixed(4);
const usdPerMinute = (cost, seconds) => cost == null || !(Number(seconds) > 0) ? "Unknown" : usd(Number(cost) * 60 / Number(seconds)) + "/min";
const date = x => x ? new Date(x).toLocaleString() : "—";
const percentage = x => x == null ? "Not reported" : Number(x).toFixed(1) + "%";
const gib = x => x == null ? "Not reported" : (Number(x) / (1024 ** 3)).toFixed(2) + " GiB";

function SectionTable({ headers, entries }) {
  return <div className="an-table-wrap"><table className="an-table">
    <thead><tr>{headers.map(x => <th key={x}>{x}</th>)}</tr></thead>
    <tbody>{entries.length ? entries.map((row, i) => <tr key={i}>
      {row.map((cell, j) => <td key={j}>{cell}</td>)}
    </tr>) : <tr><td colSpan={headers.length}>No data recorded yet.</td></tr>}</tbody>
  </table></div>;
}

function Infrastructure({ data }) {
  const api = data.samples.filter(x => x.host === "lightsail-api");
  const gpu = data.samples.filter(x => x.host === "gpu-ec2");
  const latest = [api[0], gpu[0]].filter(Boolean);
  return <>
    <div className="an-notice">{data.definitions.lightsail} {data.definitions.gpu}</div>
    <div className="an-metrics">
      {latest.map(row => <div className="an-metric" key={row.host}>
        <span>{row.host === "gpu-ec2" ? "GPU EC2" : "Lightsail API container"}</span>
        <strong>{percentage(row.host === "gpu-ec2" ? row.gpuPct : row.cpuPct)}</strong>
        <small>Used RAM: {gib(row.ramUsedBytes)} / {gib(row.ramTotalBytes)}
          {row.host === "gpu-ec2" ? " · VRAM " + gib(row.vramUsedBytes) + " / " + gib(row.vramTotalBytes) : ""}
        </small>
        <small>Last sampled {date(row.collectedAt)}</small>
      </div>)}
    </div>
    {!gpu.length && <p className="an-notice">GPU telemetry has not been configured or received yet. The GPU host is not being polled or restarted. See the operator guide to enable outbound sampling.</p>}
    <section className="pa-card"><h2>Latest infrastructure samples</h2>
      <p>Numerical samples only. No process names, audio or customer data.</p>
      <SectionTable headers={["Host", "CPU / GPU utilization", "RAM used", "VRAM used", "Temperature", "UTC timestamp"]}
        entries={data.samples.slice(0, 80).map(x => [
          x.host, percentage(x.host === "gpu-ec2" ? x.gpuPct : x.cpuPct),
          gib(x.ramUsedBytes), gib(x.vramUsedBytes),
          x.temperatureC == null ? "—" : x.temperatureC + "°C", date(x.collectedAt),
        ])} />
      <p className="an-muted">Most recent 80 samples shown. API samples every 60 seconds; a rolling seven-day history is retained.</p>
    </section>
  </>;
}
function Economics({ data }) {
  const totals = data.totals;
  return <>
    <div className="an-notice">{data.coverage.providerCosts} {data.coverage.infrastructure} {data.coverage.revenue}</div>
    <div className="an-metrics">
      <div className="an-metric"><span>Projects in report</span><strong>{n(totals.projects)}</strong><small>{n(totals.rendered)} with final video</small></div>
      <div className="an-metric"><span>Verified provider spend (partial)</span><strong>{usd(totals.verifiedProviderCostUsd)}</strong><small>{n(totals.verifiedCostOperations)} of {n(totals.tracedOperations)} measured operations include cost</small></div>
      <div className="an-metric"><span>Estimated compute allocation</span><strong>{usd(totals.estimatedComputeAllocationUsd)}</strong><small>Only when hourly rates are configured; never presented as invoice cost</small></div>
      <div className="an-metric"><span>Billed revenue and margin</span><strong>Not available</strong><small>Awaiting reconciled Paddle revenue and complete provider charges</small></div>
    </div>
    <section className="pa-card"><h2>Projects — generation cost coverage</h2>
      <SectionTable headers={["Project", "Current plan", "Generated video", "Operations", "Verified cost", "Verified cost/min", "Compute allocation"]}
        entries={data.projects.map(row => [
          row.title || row.projectId.slice(0, 8), row.plan,
          row.rendered ? row.outputSeconds.toFixed(1) + " sec" : "Not rendered",
          n(row.tracedOperations), usd(row.verifiedProviderCostUsd),
          usdPerMinute(row.verifiedProviderCostUsd, row.rendered ? row.outputSeconds : 0),
          usd(row.estimatedComputeAllocationUsd),
        ])} />
    </section>
    <section className="pa-card"><h2>Cost coverage by current subscription plan</h2>
      <SectionTable headers={["Plan", "Projects", "Rendered", "Verified provider cost", "Estimated compute", "Margin"]}
        entries={data.plans.map(row => [
          row.plan, n(row.projects), n(row.rendered),
          usd(row.verifiedProviderCostUsd), usd(row.computeAllocationUsd), "Unavailable",
        ])} />
      <p className="an-muted">{data.coverage.plan} Historical projects are capped at {data.coverage.projectSampleLimit} and traces at {data.coverage.operationSampleLimit}.
        {data.coverage.possibleTruncation ? " Report is truncated; do not use for platform-wide reconciliation." : ""}
      </p>
    </section>
    <section className="pa-card"><h2>Cost coverage by customer</h2>
      <SectionTable headers={["User reference", "Projects", "Generated videos", "Verified cost", "Estimated compute", "Margin"]}
        entries={data.users.map(row => [
          row.userId?.slice(0, 12) || "Unknown", n(row.projects), n(row.rendered),
          usd(row.verifiedProviderCostUsd), usd(row.computeAllocationUsd), "Unavailable",
        ])} />
    </section>
  </>;
}

export default function AdminMonitoringDetail({ view, days, nonce }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true });
    const period = days;
    fetch("/api/platform-admin/analytics/" + view + "?days=" + period,
      { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async res => { const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Report unavailable"); return data; })
      .then(data => { if (!controller.signal.aborted) setState({ data }); })
      .catch(error => { if (!controller.signal.aborted) setState({ error: error.message }); });
    return () => controller.abort();
  }, [view, days, nonce]);
  if (state.loading) return <p role="status">Loading detailed monitoring…</p>;
  if (state.error) return <p role="alert" className="pa-error">{state.error}</p>;
  return view === "infrastructure"
    ? <Infrastructure data={state.data} />
    : <Economics data={state.data} />;
}
