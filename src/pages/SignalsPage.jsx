import { useState } from "react";
import Header from "../components/Header";
import SignalCard from "../components/SignalCard";
import { IconScan, IconClapper } from "../components/Icons";
import { signals, categories } from "../data/signals";
import "../components/ui.css";
import "./SignalsPage.css";

export default function SignalsPage() {
  const [active, setActive] = useState("All");

  const filtered =
    active === "All"
      ? signals
      : signals.filter((s) => s.category.toLowerCase() === active.toLowerCase());

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

        <div className="hx-filters" role="tablist" aria-label="Filter signals by category">
          {categories.map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={active === c}
              className={`pill ${active === c ? "is-active" : ""}`}
              onClick={() => setActive(c)}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="hx-signals__list">
          {filtered.map((s, i) => (
            <SignalCard key={s.id} signal={s} featured={i === 0} />
          ))}
          {filtered.length === 0 && (
            <p className="hx-signals__empty">No signals in this category right now. Check back after the next scan.</p>
          )}
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
