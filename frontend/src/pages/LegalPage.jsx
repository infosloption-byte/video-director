import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import PublicHeader from "../components/PublicHeader";
import LegalFooter from "../components/LegalFooter";
import { legalDocuments, legalIdentity, LEGAL_EFFECTIVE_DATE, LEGAL_VERSION } from "../legal/legalDocuments";
import "../components/ui.css";
import "./LegalPage.css";

const DOCS = [
  { type: "privacy", path: "/privacy", short: "Privacy Policy", blurb: "How accounts, projects, voice samples and billing data are handled." },
  { type: "terms", path: "/terms", short: "Terms & Conditions", blurb: "The rules for using Voxora, including voice cloning and prohibited use." },
  { type: "refund", path: "/refund-policy", short: "Refund Policy", blurb: "Cancellations, refunds and how Paddle billing works." },
];

const HEADER_OFFSET = 150; // sticky header + mobile jump bar

function wordCount(policy) {
  const text = policy.sections.flatMap((s) => [...(s.paragraphs || []), ...(s.bullets || [])]).join(" ");
  return text.split(/\s+/).filter(Boolean).length;
}

export default function LegalPage({ type }) {
  const policy = legalDocuments[type];
  const { hash, key: locationKey } = useLocation();
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [jumpKey, setJumpKey] = useState(null); // open for one navigation only, so switching documents closes it
  const jumpOpen = jumpKey === locationKey;
  const articleRef = useRef(null);
  const jumpRef = useRef(null);

  const readMinutes = useMemo(() => (policy ? Math.max(1, Math.round(wordCount(policy) / 210)) : 0), [policy]);
  const otherDocs = DOCS.filter((doc) => doc.type !== type);

  useEffect(() => {
    if (!policy) return undefined;
    const previousTitle = window.document.title;
    const canonical = window.document.querySelector('link[rel="canonical"]');
    const previousHref = canonical?.getAttribute("href");
    window.document.title = `${policy.title} — Voxora`;
    if (canonical) canonical.href = `${window.location.origin}${window.location.pathname}`;
    return () => {
      window.document.title = previousTitle;
      if (canonical && previousHref) canonical.href = previousHref;
    };
  }, [policy]);

  // New document → start at the top. Deep links (#section-3, #contact) → scroll to the section.
  useEffect(() => {
    if (!hash) { window.scrollTo(0, 0); return undefined; }
    const timer = window.setTimeout(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [type, hash]);

  // Reading progress + current section, throttled with rAF.
  useEffect(() => {
    if (!policy) return undefined;
    let frame = 0;
    function update() {
      frame = 0;
      const article = articleRef.current;
      if (!article) return;
      const rect = article.getBoundingClientRect();
      const total = rect.height - window.innerHeight * 0.6;
      setProgress(total > 0 ? Math.min(1, Math.max(0, (-rect.top + HEADER_OFFSET) / total)) : 0);
      let current = 0;
      article.querySelectorAll("[data-legal-section]").forEach((node, index) => {
        if (node.getBoundingClientRect().top - HEADER_OFFSET <= 8) current = index;
      });
      setActiveIndex(current);
    }
    function onScroll() { if (!frame) frame = window.requestAnimationFrame(update); }
    frame = window.requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [policy]);

  // Close the mobile jump list on outside tap / Escape.
  useEffect(() => {
    if (!jumpOpen) return undefined;
    const onPointerDown = (event) => { if (!jumpRef.current?.contains(event.target)) setJumpKey(null); };
    const onKeyDown = (event) => { if (event.key === "Escape") setJumpKey(null); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [jumpOpen]);

  const goTo = useCallback((id) => (event) => {
    event.preventDefault();
    setJumpKey(null);
    const node = document.getElementById(id);
    if (!node) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    node.focus({ preventScroll: true });
  }, []);

  if (!policy) return null;
  const sections = policy.sections;
  const currentTitle = activeIndex < sections.length ? sections[activeIndex].title : "Contact";
  const phoneHref = `tel:${legalIdentity.phone.replace(/[^\d+]/g, "")}`;

  return (
    <div className="hx-page legal-page">
      <PublicHeader />
      <div className="legal-progress" aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></div>

      <main className="container legal-page__main">
        <nav className="legal-crumbs" aria-label="Breadcrumb">
          <Link to="/">Voxora</Link><span aria-hidden="true">/</span><span>Legal</span><span aria-hidden="true">/</span><span aria-current="page">{policy.title}</span>
        </nav>

        <header className="legal-hero">
          <span className="legal-hero__category">{policy.category}</span>
          <h1>{policy.title}</h1>
          <p className="legal-hero__intro">{policy.intro}</p>
          <dl className="legal-meta">
            <div><dt>Effective</dt><dd>{LEGAL_EFFECTIVE_DATE}</dd></div>
            <div><dt>Version</dt><dd>{LEGAL_VERSION}</dd></div>
            <div><dt>Reading time</dt><dd>{readMinutes} min</dd></div>
            <div><dt>Operator</dt><dd>{legalIdentity.operator}</dd></div>
          </dl>
        </header>

        <div className="legal-switch" role="navigation" aria-label="Legal documents">
          {DOCS.map((doc) => (
            <Link key={doc.type} to={doc.path} className={doc.type === type ? "is-current" : undefined} aria-current={doc.type === type ? "page" : undefined}>{doc.short}</Link>
          ))}
          <button type="button" className="legal-switch__print" onClick={() => window.print()}>Print</button>
        </div>

        {/* Tablet / phone: compact sticky "jump to" control instead of a side column */}
        <div className="legal-jump" ref={jumpRef}>
          <button type="button" className="legal-jump__button" aria-expanded={jumpOpen} aria-controls="legal-jump-list" onClick={() => setJumpKey(jumpOpen ? null : locationKey)}>
            <span className="legal-jump__label">Jump to</span>
            <span className="legal-jump__current">{String(Math.min(activeIndex, sections.length) + 1).padStart(2, "0")} · {currentTitle}</span>
            <span className="legal-jump__chevron" aria-hidden="true">{jumpOpen ? "▴" : "▾"}</span>
          </button>
          {jumpOpen && (
            <ol id="legal-jump-list" className="legal-jump__list">
              {sections.map((section, index) => (
                <li key={section.title}><a href={`#section-${index + 1}`} onClick={goTo(`section-${index + 1}`)} className={index === activeIndex ? "is-active" : undefined}><span>{String(index + 1).padStart(2, "0")}</span>{section.title}</a></li>
              ))}
              <li><a href="#contact" onClick={goTo("contact")} className={activeIndex >= sections.length ? "is-active" : undefined}><span>{String(sections.length + 1).padStart(2, "0")}</span>Contact</a></li>
            </ol>
          )}
        </div>

        <div className="legal-layout">
          <aside className="legal-toc" aria-label="On this page">
            <p>ON THIS PAGE</p>
            <ol>
              {sections.map((section, index) => (
                <li key={section.title}>
                  <a href={`#section-${index + 1}`} onClick={goTo(`section-${index + 1}`)} className={index === activeIndex ? "is-active" : undefined} aria-current={index === activeIndex ? "location" : undefined}>
                    <span>{String(index + 1).padStart(2, "0")}</span>{section.title}
                  </a>
                </li>
              ))}
              <li><a href="#contact" onClick={goTo("contact")} className={activeIndex >= sections.length ? "is-active" : undefined}><span>{String(sections.length + 1).padStart(2, "0")}</span>Contact</a></li>
            </ol>
          </aside>

          <article className="legal-article" ref={articleRef}>
            {sections.map((section, index) => (
              <section id={`section-${index + 1}`} data-legal-section className="legal-section" key={section.title} tabIndex={-1} aria-labelledby={`section-${index + 1}-title`}>
                <header className="legal-section__head">
                  <span className="legal-section__num">{String(index + 1).padStart(2, "0")}</span>
                  <h2 id={`section-${index + 1}-title`}>{section.title}</h2>
                </header>
                <div className="legal-section__body">
                  {section.paragraphs?.map((p, i) => <p key={i}>{p}</p>)}
                  {section.bullets && <ul>{section.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
                  {section.links && <div className="legal-links">{section.links.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">{link.label} <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a>)}</div>}
                </div>
              </section>
            ))}

            <section id="contact" data-legal-section className="legal-contact" tabIndex={-1} aria-labelledby="contact-title">
              <header className="legal-section__head">
                <span className="legal-section__num">{String(sections.length + 1).padStart(2, "0")}</span>
                <h2 id="contact-title">Questions or privacy requests?</h2>
              </header>
              <p className="legal-contact__lead">Voxora is a product of <strong>{legalIdentity.operator}</strong>, a registered business in Sri Lanka.</p>
              <dl className="legal-contact__grid">
                <div><dt>Business registration</dt><dd>{legalIdentity.registrationNumber}</dd></div>
                <div><dt>Registered</dt><dd>{legalIdentity.registeredDate}</dd></div>
                <div className="is-wide"><dt>Registered address</dt><dd>{legalIdentity.address}</dd></div>
                <div><dt>Email</dt><dd><a href={`mailto:${legalIdentity.email}`}>{legalIdentity.email}</a></dd></div>
                <div><dt>Phone</dt><dd><a href={phoneHref}>{legalIdentity.phone}</a></dd></div>
                <div className="is-wide"><dt>Company website</dt><dd><a href={legalIdentity.website} target="_blank" rel="noopener noreferrer">sloptions.xyz <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></a></dd></div>
              </dl>
              <p className="legal-contact__note">For privacy requests, do not attach password reset links, payment-card details or voice samples. We may ask you to verify account ownership.</p>
            </section>

            <aside className="legal-related" aria-label="Other legal documents">
              <p>MORE INFORMATION</p>
              <div>
                {otherDocs.map((doc) => (
                  <Link key={doc.type} to={doc.path}><strong>{doc.short} <span aria-hidden="true">→</span></strong><span>{doc.blurb}</span></Link>
                ))}
              </div>
            </aside>

            <button type="button" className="legal-top" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}>↑ Back to top</button>
          </article>
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}
