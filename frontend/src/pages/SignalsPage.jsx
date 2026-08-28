import { useEffect, useMemo, useState } from "react";
import Header from "../components/Header";
import SignalCard from "../components/SignalCard";
import { IconScan, IconClapper } from "../components/Icons";
import { swatchSets, categories } from "../data/signals";
import "../components/ui.css";
import "./SignalsPage.css";

const SWATCH_KEYS = Object.keys(swatchSets);
const RELIABILITY_LABEL = { peer_reviewed: "Peer-reviewed", ai_search: "AI-curated search", general_web: "General web" };

function toCardSignal(row, index) {
  return {
    ...row,
    id: row.id,
    origin: row.origin || "suggested",
    sourceType: row.sourceType,
    sourceReliability: row.sourceReliability,
    searchQuery: row.searchQuery,
    sourceUrl: row.sourceUrl,
    rawContent: row.rawContent,
    rank: String(row.rank ?? index + 1).padStart(2, "0"),
    category: row.category,
    pct: row.heatPct ?? "",
    title: row.title,
    description: row.description ?? "",
    whyLabel: "WHY THIS",
    why: row.whyReasoning,
    source: row.sourceName ?? "",
    sourceNote: RELIABILITY_LABEL[row.sourceReliability] ?? "",
    thumb: swatchSets[SWATCH_KEYS[index % SWATCH_KEYS.length]][0],
  };
}

export default function SignalsPage() {
  const [active, setActive] = useState("All");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [signals, setSignals] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadSignals() {
      setStatus("loading"); setError("");
      try {
        const endpoint = submittedQuery ? `/api/signals/search?q=${encodeURIComponent(submittedQuery)}` : `/api/signals${active !== "All" ? `?category=${encodeURIComponent(active)}` : ""}`;
        const res = await fetch(endpoint); const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Request failed with ${res.status}`);
        if (cancelled) return;
        setSignals((data.signals ?? []).map(toCardSignal)); setStatus("ready");
      } catch (err) { if (!cancelled) { console.error("Failed to load signals:", err); setError(err.message || "Failed to load signals."); setStatus("error"); } }
    }
    loadSignals(); return () => { cancelled = true; };
  }, [active, submittedQuery]);

  const visibleSignals = useMemo(() => active === "All" ? signals : signals.filter((signal) => signal.category?.toUpperCase() === active.toUpperCase()), [signals, active]);
  function handleSearch(event) { event.preventDefault(); setSubmittedQuery(query.trim()); }
  function handleCategory(category) { setActive(category); }
  function clearSearch() { setQuery(""); setSubmittedQuery(""); }

  const headerActions = (
    <>
      <span className="badge hx-desktop-only">1 REEL</span>
      <button type="button" className="btn btn-ghost hx-header__compact-action hx-scan-action" aria-label="Scan signals" title="Scan signals">
        <IconScan className="btn-icon" />
        <span className="hx-header__action-label">Scan signals</span>
      </button>
    </>
  );

  return (
    <div className="hx-page hx-landing">
      <Header right={headerActions} />
      <main className="container hx-hero">
        <div className="hx-hero__content">
          <p className="eyebrow">Science &amp; Tech Auto-Director</p>
          <h1 className="hx-hero__title">Pick a signal. Helix directs the Reel.</h1>
          <p className="hx-hero__desc">Discover what is heating up in science and technology. Helix turns a signal into research, a narrative, visuals, and a finished short-form reel.</p>
          <div className="hx-hero__actions">
            <a className="btn btn-cream hx-hero__cta" href="#signals"><IconClapper className="btn-icon" /> Explore today's signals</a>
            <p className="hx-hero__trust">No login required to browse. Sign in when you're ready to direct a Reel.</p>
          </div>
        </div>
        <div className="hx-hero__rail" aria-hidden="true">
          <span>DISCOVER</span><span>RESEARCH</span><span>DIRECT</span>
        </div>
      </main>
      <section id="signals" className="container hx-signals">
        <div className="hx-signals__head"><div><p className="eyebrow">Live signal desk</p><h2 className="hx-signals__title">Today's signals</h2><p className="hx-signals__sub">Ordered by search heat. Search the feed or filter it by category.</p></div><span className="hx-signals__count">{status === "ready" ? `${visibleSignals.length} signals` : "Live feed"}</span></div>
        <form className="hx-search" onSubmit={handleSearch} role="search"><div className="hx-search__field"><span className="hx-search__icon" aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search science & tech signals…" aria-label="Search science and technology signals" maxLength={200} />{query && <button type="button" className="hx-search__clear" onClick={clearSearch} aria-label="Clear search">×</button>}</div><button className="btn btn-cream hx-search__submit" type="submit" disabled={!query.trim()}>Search</button></form>
        <div className="hx-filters" role="tablist" aria-label="Filter signals by category">{categories.map((c) => <button key={c} type="button" role="tab" aria-selected={active === c} className={`pill ${active === c ? "is-active" : ""}`} onClick={() => handleCategory(c)}>{c}</button>)}{submittedQuery && <button className="pill hx-search__reset" onClick={clearSearch} type="button">Clear search</button>}</div>
        {submittedQuery && status === "ready" && <p className="hx-search__summary">Search results for <strong>“{submittedQuery}”</strong> · {visibleSignals.length} found</p>}
        <div className="hx-signals__list">
          {status === "loading" && <p className="hx-signals__empty">{submittedQuery ? "Searching trusted sources…" : "Loading signals…"}</p>}
          {status === "error" && <p className="hx-signals__empty">{error || "Couldn't load signals right now. Is the backend running on port 4000?"}</p>}
          {status === "ready" && visibleSignals.length === 0 && <p className="hx-signals__empty">{submittedQuery ? `No signals found for “${submittedQuery}”. Try a broader topic or keyword.` : "No signals in this category right now. Check back after the next scan."}</p>}
          {status === "ready" && visibleSignals.map((s, i) => <SignalCard key={`${s.id}-${i}`} signal={s} featured={i === 0} />)}
        </div>
      </section>
      <footer className="hx-footer"><div className="container hx-footer__inner"><span>Helix — a science &amp; tech auto-director.</span><span>Signals refresh every 4 hours.</span></div></footer>
    </div>
  );
}
