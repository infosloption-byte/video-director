import { useEffect, useMemo, useState } from "react";
import Header from "../components/Header";
import SignalCard from "../components/SignalCard";
import { IconScan, IconClapper } from "../components/Icons";
import { swatchSets, categories } from "../data/signals";
import "../components/ui.css";
import "./SignalsPage.css";

const SWATCH_KEYS = Object.keys(swatchSets);
const RELIABILITY_LABEL = {
  peer_reviewed: "Peer-reviewed",
  ai_search: "AI-curated search",
  general_web: "General web",
};

function toCardSignal(row, index) {
  return {
    id: row.id,
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
      setStatus("loading");
      setError("");
      try {
        const endpoint = submittedQuery
          ? `/api/signals/search?q=${encodeURIComponent(submittedQuery)}`
          : `/api/signals${active !== "All" ? `?category=${encodeURIComponent(active)}` : ""}`;
        const res = await fetch(endpoint);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Request failed with ${res.status}`);
        if (cancelled) return;
        setSignals((data.signals ?? []).map(toCardSignal));
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load signals:", err);
        setError(err.message || "Failed to load signals.");
        setStatus("error");
      }
    }

    loadSignals();
    return () => { cancelled = true; };
  }, [active, submittedQuery]);

  const visibleSignals = useMemo(() => {
    if (active === "All") return signals;
    return signals.filter((signal) => signal.category?.toUpperCase() === active.toUpperCase());
  }, [signals, active]);

  function handleSearch(event) {
    event.preventDefault();
    const nextQuery = query.trim();
    if (!nextQuery) {
      setSubmittedQuery("");
      return;
    }
    setSubmittedQuery(nextQuery);
  }

  function handleCategory(category) {
    setActive(category);
    // Category filtering is applied to search results locally; for the
    // suggested feed it is also pushed to the API query.
  }

  function clearSearch() {
    setQuery("");
    setSubmittedQuery("");
  }

  return (
    <div className="hx-page">
      <Header
        right={
          <>
            <span className="badge">1 REEL</span>
            <button className="btn btn-ghost">
              <IconScan className="btn-icon" /> Scan signals
            </button>
          </>
        }
      />

      <main className="container hx-hero">
        <p className="eyebrow">Science &amp; Tech Auto-Director</p>
        <h1 className="hx-hero__title">Pick a signal. Helix directs the Reel.</h1>
        <p className="hx-hero__desc">
          Zero typing. Helix chooses the narrative, writes the hook, casts B-roll, and shows the
          reasoning on every cut. You approve — or swap.
        </p>
        <button className="btn btn-cream hx-hero__cta">
          <IconClapper className="btn-icon" /> Play the sample cut
        </button>
      </main>

      <section className="container hx-signals">
        <div className="hx-signals__head">
          <h2 className="hx-signals__title">Today's signals</h2>
          <p className="hx-signals__sub">Ordered by search heat. Helix already knows which framework fits.</p>
        </div>

        <form className="hx-search" onSubmit={handleSearch} role="search">
          <div className="hx-search__field">
            <span className="hx-search__icon" aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search science & tech signals…"
              aria-label="Search science and technology signals"
              maxLength={200}
            />
            {query && (
              <button type="button" className="hx-search__clear" onClick={clearSearch} aria-label="Clear search">
                ×
              </button>
            )}
          </div>
          <button className="btn btn-cream hx-search__submit" type="submit" disabled={!query.trim()}>
            Search
          </button>
        </form>

        <div className="hx-filters" role="tablist" aria-label="Filter signals by category">
          {categories.map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={active === c}
              className={`pill ${active === c ? "is-active" : ""}`}
              onClick={() => handleCategory(c)}
            >
              {c}
            </button>
          ))}
          {submittedQuery && (
            <button className="pill hx-search__reset" onClick={clearSearch} type="button">
              Clear search
            </button>
          )}
        </div>

        {submittedQuery && status === "ready" && (
          <p className="hx-search__summary">
            Search results for <strong>“{submittedQuery}”</strong> · {visibleSignals.length} found
          </p>
        )}

        <div className="hx-signals__list">
          {status === "loading" && <p className="hx-signals__empty">{submittedQuery ? "Searching trusted sources…" : "Loading signals…"}</p>}

          {status === "error" && (
            <p className="hx-signals__empty">
              {error || "Couldn't load signals right now. Is the backend running on port 4000?"}
            </p>
          )}

          {status === "ready" && visibleSignals.length === 0 && (
            <p className="hx-signals__empty">
              {submittedQuery ? `No signals found for “${submittedQuery}”. Try a broader topic or keyword.` : "No signals in this category right now. Check back after the next scan."}
            </p>
          )}

          {status === "ready" && visibleSignals.map((s, i) => (
            <SignalCard key={`${s.id}-${i}`} signal={s} featured={i === 0} />
          ))}
        </div>
      </section>

      <footer className="hx-footer">
        <div className="container hx-footer__inner">
          <span>Helix — a science &amp; tech auto-director.</span>
          <span>Signals refresh every 4 hours.</span>
        </div>
      </footer>
    </div>
  );
}
