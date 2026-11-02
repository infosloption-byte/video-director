import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useProjects } from "../context/useProjects.js";
import "./WebsiteToVideoPage.css";

async function api(url, options = {}) {
  const res = await fetch(url, { credentials: "include", cache: "no-store", ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Website research could not be completed.");
  return data;
}

function Source({ url, children }) {
  if (!url) return null;
  return <a href={url} target="_blank" rel="noopener noreferrer" className="wtv-source">{children || "View source ↗"}</a>;
}

function Findings({ title, items, empty }) {
  return <section className="wtv-section">
    <h2>{title} <span>{items.length}</span></h2>
    {items.length ? <div className="wtv-results">
      {items.map((item, index) => <article className="wtv-result" key={item.sourceUrl + ":" + index}>
        <h3>{item.title}</h3>
        {item.description && <p>{item.description}</p>}
        {item.prices?.length > 0 && <p className="wtv-fine">Public prices mentioned: {item.prices.join(" · ")}</p>}
        {!!item.highlights?.length && <ul>{item.highlights.slice(0, 5).map((value, i) => <li key={i}>{value}</li>)}</ul>}
        <Source url={item.sourceUrl}/>
      </article>)}
    </div> : <p className="wtv-empty">{empty || "No matching information was found in the sampled pages."}</p>}
  </section>;
}

export default function WebsiteToVideoPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refreshProjects } = useProjects();
  const [url, setUrl] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [creating, setCreating] = useState("");
  const [selectedTab, setSelectedTab] = useState("overview");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api("/api/website-analyses").then(data => {
      if (!cancelled) setHistory(data.analyses || []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!id) { setAnalysis(null); return undefined; }
    let cancelled = false, timer;
    async function poll() {
      try {
        const data = await api("/api/website-analyses/" + encodeURIComponent(id));
        if (cancelled) return;
        setAnalysis(data.analysis);
        if (["queued", "running", "converting"].includes(data.analysis?.status))
          timer = window.setTimeout(poll, 2300);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    setError("");
    void poll();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [id, refreshKey]);

  async function begin(event) {
    event.preventDefault();
    if (starting) return;
    setStarting(true); setError("");
    try {
      const data = await api("/api/website-analyses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      navigate("/website-to-video/" + data.analysis.id);
    } catch (err) { setError(err.message); }
    finally { setStarting(false); }
  }

  async function retry() {
    setError(""); setStarting(true);
    try {
      await api("/api/website-analyses/" + id + "/retry", { method: "POST" });
      const data = await api("/api/website-analyses/" + id);
      setAnalysis(data.analysis);
      // Restart polling via React state, without losing the workspace.
      setRefreshKey(value => value + 1);
      setStarting(false);
    } catch (err) { setError(err.message); setStarting(false); }
  }

  async function createVideo(ideaId) {
    if (creating) return;
    setCreating(ideaId); setError("");
    try {
      const data = await api("/api/website-analyses/" + id + "/videos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId }),
      });
      await refreshProjects();
      navigate(data.path || ("/storyboard/" + data.projectId + "?stage=setup"));
    } catch (err) { setError(err.message); setCreating(""); }
  }

  const report = analysis?.report;
  const active = ["queued", "running", "converting"].includes(analysis?.status);
  const tabs = ["overview", "products", "services", "offers", "contact", "pages", "videos"];

  return <div className="wtv-page">
    <div className="wtv-header">
      <div><p className="wtv-eyebrow">Voxora / Website to Video</p>
        <h1>Turn a website into a video story.</h1>
        <p>Explore a public website, review what Voxora found and choose a research-backed promotional video idea.</p>
      </div>
      {id && <Link to="/website-to-video" className="wtv-link">Analyze another website</Link>}
    </div>

    {!id && <div className="wtv-form-card">
      <form onSubmit={begin}>
        <label htmlFor="wtv-url">Website address</label>
        <div className="wtv-form-row">
          <input id="wtv-url" inputMode="url" type="url" placeholder="https://yourbusiness.com"
            required maxLength={2048} value={url} onChange={event=>setUrl(event.target.value)} />
          <button className="wtv-primary" type="submit" disabled={starting}>{starting ? "Starting…" : "Analyze website →"}</button>
        </div>
        <p className="wtv-fine">Analyzes up to 20 publicly accessible HTML pages. No login, payment or website access credentials required. 5 new analyses per 24 hours.</p>
      </form>
    </div>}

    {error && <div className="wtv-error" role="alert">{error}</div>}

    {!id && history.length > 0 && <section className="wtv-section">
      <h2>Recent analyses</h2>
      <div className="wtv-history">{history.map(item =>
        <Link key={item.id} to={"/website-to-video/" + item.id}>
          <span>{item.url}</span><small>{item.status}</small>
        </Link>)}</div>
    </section>}

    {id && !analysis && !error && <p role="status" className="wtv-status">Loading saved website research…</p>}
    {active && <div className="wtv-form-card" role="status" aria-live="polite">
      <p className="wtv-eyebrow">Website intelligence in progress</p>
      <h2>{analysis.stage || "Scanning website…"}</h2>
      <p className="wtv-fine">Analyzing {analysis.url}. You can leave this page and return later.</p>
      <div className="wtv-progress"><span style={{width: Math.min(100, Math.max(0, analysis.progress || 0)) + "%"}}/></div>
      <p className="wtv-fine">{analysis.progress || 0}%</p>
    </div>}
    {["failed", "interrupted"].includes(analysis?.status) && <div className="wtv-form-card">
      <h2>Analysis could not finish</h2><p>{analysis.error}</p>
      <button type="button" className="wtv-primary" onClick={retry} disabled={starting}>{starting ? "Restarting…" : "Retry analysis"}</button>
    </div>}

    {report && <div className="wtv-report">
      <div className="wtv-summary">
        <div><p className="wtv-eyebrow">Website research complete</p>
          <h2>{report.name}</h2>
          {report.originalHeading && report.originalHeading !== report.name &&
            <p className="wtv-site-headline"><span>Website headline</span>{report.originalHeading}</p>}
          <p>{report.description || "No website description was published."}</p>
          <Source url={report.url}>Visit analyzed website ↗</Source>
        </div>
        <div className="wtv-stats">
          <div><strong>{report.pagesScanned}</strong><span>Pages scanned</span></div>
          <div><strong>{report.products.length}</strong><span>Product pages</span></div>
          <div><strong>{report.services.length}</strong><span>Service pages</span></div>
          <div><strong>{report.videoIdeas.length}</strong><span>Video concepts</span></div>
        </div>
      </div>
      <nav className="wtv-tabs" aria-label="Website intelligence sections">
        {tabs.map(tab=><button key={tab} type="button" aria-current={selectedTab===tab?"page":undefined}
          className={selectedTab===tab?"is-active":""} onClick={()=>setSelectedTab(tab)}>
          {tab==="videos"?"Video ideas":tab.charAt(0).toUpperCase()+tab.slice(1)}
        </button>)}
      </nav>
      {selectedTab==="overview" && <section className="wtv-section">
        <h2>Business overview</h2>
        <p>{report.summary || "Voxora could not identify a published overview."}</p>
        <Source url={report.url}>Homepage evidence ↗</Source>
        <p className="wtv-fine">Source-limited snapshot. Website content is not independently verified.</p>
        <Findings title="About the business" items={report.about}/>
      </section>}
      {selectedTab==="products" && <Findings title="Products" items={report.products}/>}
      {selectedTab==="services" && <Findings title="Services" items={report.services}/>}
      {selectedTab==="offers" && <section className="wtv-section"><h2>Published offers</h2>
        {report.offers.length ? report.offers.map((item,index)=><article key={index} className="wtv-result"><p>{item.text}</p><Source url={item.sourceUrl}/></article>)
          : <p className="wtv-empty">No explicit promotion found. Voxora will not invent discounts.</p>}
        <p className="wtv-fine">Verify terms, dates and availability before advertising.</p>
      </section>}
      {selectedTab==="contact" && <section className="wtv-section"><h2>Public contact details</h2>
        <div className="wtv-results">{[["Business emails",report.contacts.emails],["Published phone numbers",report.contacts.phones],["Social and messaging",report.contacts.social]].map(([name,values])=>
          <article className="wtv-result" key={name}><h3>{name}</h3>{values.length?values.map(x=><p key={x}>{x}</p>):<p className="wtv-empty">Not found</p>}</article>)}</div>
        {report.contacts.sourceUrls.map(x=><Source key={x} url={x}/>)}
      </section>}
      {selectedTab==="pages" && <section className="wtv-section"><h2>Scanned pages</h2>
        <div className="wtv-results">{report.pages.map(p=><article className="wtv-result" key={p.url}>
          <h3>{p.title || p.headings?.[0] || p.url}</h3><p>{p.description || p.textPreview}</p>
          {p.highlights?.length>0&&<ul>{p.highlights.slice(0,4).map((x,i)=><li key={i}>{x}</li>)}</ul>}
          <Source url={p.url}/></article>)}</div>
        {report.failures?.length>0&&<p className="wtv-fine">{report.failures.length} pages could not be inspected; see limitations.</p>}
      </section>}
      {selectedTab==="videos" && <section className="wtv-section">
        <h2>Suggested videos <span>{report.videoIdeas.length}</span></h2>
        <p>Choose a concept to continue into Voxora's familiar setup, storyboard, narration and MP4 workflow.</p>
        <div className="wtv-ideas">{report.videoIdeas.map(idea=><article className="wtv-idea" key={idea.id}>
          <span className="wtv-chip">{idea.durationSeconds} sec · Source-backed concept</span>
          <h3>{idea.title}</h3>
          {idea.focus && <p className="wtv-idea__focus"><strong>Focus:</strong> {idea.focus}</p>}
          <p>{idea.angle}</p>
          {idea.hook && <p className="wtv-idea__brief"><strong>Suggested hook</strong> {idea.hook}</p>}
          {idea.audience && <p className="wtv-idea__brief"><strong>Audience</strong> {idea.audience}</p>}
          {idea.cta && <p className="wtv-idea__brief"><strong>CTA</strong> {idea.cta}</p>}
          <p className="wtv-fine">Website statements are business-published; review claims before advertising.</p>
          <div className="wtv-evidence">{idea.evidenceUrls.map(link=><Source key={link} url={link}>{new URL(link).pathname || "/" } ↗</Source>)}</div>
          <button type="button" className="wtv-primary" onClick={()=>createVideo(idea.id)} disabled={Boolean(creating)}>
            {creating===idea.id?"Preparing workspace…":analysis.createdVideos?.some(x=>x.ideaId===idea.id)?"Continue to setup →":"Create video & continue to setup →"}</button>
        </article>)}</div>
      </section>}
      <div className="wtv-notice"><strong>Research boundaries.</strong> {report.limitations.join(" ")}
        Images discovered on the website are references only and are not automatically licensed for reuse.</div>
    </div>}
  </div>;
}
