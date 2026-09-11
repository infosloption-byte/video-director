import { useEffect, useMemo, useState } from "react";
import Header from "../components/Header";
import SignalCard from "../components/SignalCard";
import SelectMenu from "../components/SelectMenu";
import { IconScan, IconClapper } from "../components/Icons";
import { swatchSets, categories } from "../data/signals";
import "../components/ui.css";
import "./SignalsPage.css";

const SWATCH_KEYS = Object.keys(swatchSets);
const RELIABILITY_LABEL = { peer_reviewed: "Peer-reviewed", ai_search: "AI-curated search", general_web: "General web" };
const PAGE_SIZES = [6, 12, 24, 48];
const SORT_OPTIONS = [
  { value: "heat", label: "Search heat" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "title", label: "Title A–Z" },
];

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


function pageNumbers(currentPage, totalPages) {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  return Array.from({ length: 5 }, (_, index) => start + index);
}

export default function SignalsPage() {
  const [active, setActive] = useState("All");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [sort, setSort] = useState("heat");
  const [pageSize, setPageSize] = useState(12);
  const [page, setPage] = useState(1);
  const [signals, setSignals] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 12, total: 0, totalPages: 1 });
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadSignals() {
      setStatus("loading");
      setError("");
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort });
        let endpoint;
        if (submittedQuery) {
          params.set("q", submittedQuery);
          endpoint = `/api/signals/search?${params.toString()}`;
        } else {
          if (active !== "All") params.set("category", active);
          endpoint = `/api/signals?${params.toString()}`;
        }
        const res = await fetch(endpoint);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Request failed with ${res.status}`);
        if (cancelled) return;
        setSignals((data.signals ?? []).map(toCardSignal));
        setPagination(data.pagination ?? { page, pageSize, total: 0, totalPages: 1 });
        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load signals:", err);
          setError(err.message || "Failed to load signals.");
          setStatus("error");
        }
      }
    }
    void loadSignals();
    return () => { cancelled = true; };
  }, [active, submittedQuery, sort, page, pageSize]);

  const currentPage = pagination.page || page;
  const totalPages = pagination.totalPages || 1;
  const visibleSignals = useMemo(() => signals, [signals]);

  function handleSearch(event) {
    event.preventDefault();
    setPage(1);
    setSubmittedQuery(query.trim());
  }

  function handleCategory(category) {
    setPage(1);
    setActive(category);
  }

  function clearSearch() {
    setQuery("");
    setSubmittedQuery("");
    setPage(1);
  }

  function handleSort(event) {
    setSort(event.target.value);
    setPage(1);
  }

  function handlePageSize(event) {
    setPageSize(Number(event.target.value));
    setPage(1);
  }

  const headerActions = (
    <>
      <span className="badge hx-desktop-only">1 REEL</span>
      <button type="button" className="btn btn-ghost hx-header__compact-action hx-scan-action" aria-label="Scan signals" title="Scan signals">
        <IconScan className="btn-icon" /><span className="hx-header__action-label">Scan signals</span>
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
            <a className="btn btn-ghost hx-hero__cta" href="/research/new">Research your own topic →</a>
            <p className="hx-hero__trust">No login required to browse. Sign in when you're ready to direct a Reel or start research.</p>
          </div>
        </div>
        <div className="hx-hero__rail" aria-hidden="true"><span>DISCOVER</span><span>RESEARCH</span><span>DIRECT</span></div>
      </main>

      <section id="signals" className="container hx-signals">
        <div className="hx-signals__head">
          <div>
            <p className="eyebrow">Live signal desk</p>
            <h2 className="hx-signals__title">Today's signals</h2>
            <p className="hx-signals__sub">Search the feed, filter by category, sort the desk, and page through the results.</p>
          </div>
          <span className="hx-signals__count">{status === "ready" ? `${pagination.total} signals` : "Live feed"}</span>
        </div>

        <form className="hx-search" onSubmit={handleSearch} role="search">
          <div className="hx-search__field">
            <span className="hx-search__icon" aria-hidden="true">⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search science & tech signals…" aria-label="Search science and technology signals" maxLength={200} />
            {query && <button type="button" className="hx-search__clear" onClick={clearSearch} aria-label="Clear search">×</button>}
          </div>
          <button className="btn btn-cream hx-search__submit" type="submit" disabled={!query.trim()}>Search</button>
        </form>

        <div className="hx-filter-panel" aria-label="Signal filters and display options">
          <div className="hx-filter-panel__top">
            <div>
              <p className="eyebrow">Filters</p>
              <p className="hx-filter-panel__hint">Refine the signal desk without leaving the page.</p>
            </div>
            {submittedQuery && <button className="pill hx-search__reset" onClick={clearSearch} type="button">Clear search</button>}
          </div>
          <div className="hx-filter-panel__body">
            <div className="hx-filter-panel__category-block">
              <div className="hx-filter-panel__section-label">Topic</div>
              <div className="hx-filter-panel__categories" role="tablist" aria-label="Filter signals by category">
                {categories.map((category) => <button key={category} type="button" role="tab" aria-selected={active === category} className={`pill ${active === category ? "is-active" : ""}`} onClick={() => handleCategory(category)}>{category}</button>)}
              </div>
            </div>
            <div className="hx-filter-panel__display">
              <div className="hx-filter-panel__section-label">Display</div>
              <div className="hx-filter-panel__controls">
                <SelectMenu label="Sort" value={sort} options={SORT_OPTIONS} onChange={(value) => handleSort({ target: { value } })} />
                <SelectMenu label="Signals per page" value={pageSize} options={PAGE_SIZES.map((size) => ({ value: size, label: String(size) }))} onChange={(value) => handlePageSize({ target: { value } })} />
              </div>
            </div>
          </div>
        </div>

        {submittedQuery && status === "ready" && <p className="hx-search__summary">Search results for <strong>“{submittedQuery}”</strong> · {pagination.total} found</p>}

        <div className="hx-signals__list">
          {status === "loading" && <p className="hx-signals__empty">{submittedQuery ? "Searching trusted sources…" : "Loading signals…"}</p>}
          {status === "error" && <p className="hx-signals__empty">{error || "Couldn't load signals right now. Is the backend running on port 4000?"}</p>}
          {status === "ready" && visibleSignals.length === 0 && <p className="hx-signals__empty">{submittedQuery ? `No signals found for “${submittedQuery}”. Try a broader topic or keyword.` : "No signals in this category right now. Check back after the next scan."}</p>}
          {status === "ready" && visibleSignals.map((signal, index) => <SignalCard key={`${signal.id}-${index}`} signal={signal} featured={currentPage === 1 && index === 0} />)}
        </div>

        {status === "ready" && totalPages > 1 && (
          <nav className="hx-pagination" aria-label="Signals pagination">
            <button type="button" className="btn btn-ghost" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage <= 1}>Previous</button>
            <div className="hx-pagination__pages">
              {pageNumbers(currentPage, totalPages).map((number) => <button key={number} type="button" className={`pill ${number === currentPage ? "is-active" : ""}`} aria-current={number === currentPage ? "page" : undefined} onClick={() => setPage(number)}>{number}</button>)}
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage >= totalPages}>Next</button>
            <span className="hx-pagination__status">Page {currentPage} of {totalPages}</span>
          </nav>
        )}
      </section>

      <footer className="hx-footer"><div className="container hx-footer__inner"><span>Helix — a science &amp; tech auto-director.</span><span>Signals refresh every 4 hours.</span></div></footer>
    </div>
  );
}
