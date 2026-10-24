import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import PublicHeader from "../components/PublicHeader";
import LegalFooter from "../components/LegalFooter";
import { useAuth } from "../context/AuthContext";
import {
  AccountVisual, EditorVisual, ExportVisual, HeroVisual, ResearchVisual, ReviewVisual,
  SetupVisual, SignalsVisual, StoryboardVisual, VoiceVisual,
} from "./LandingVisuals";
import "../components/ui.css";
import "./LandingPage.css";

const ICONS = {
  signal: <path d="M3 14c2.2 0 2.2-4 4.5-4s2.3 5 4.5 5 2.2-7 4.5-7 2.3 4 4.5 4" />,
  research: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 5 5M8.5 10.5l1.5 1.5 2.5-3" /></>,
  setup: <><path d="M5 7h9M18 7h1M5 17h1M10 17h9" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
  scenes: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M4 10h16M9 5v14" /></>,
  voice: <><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" /></>,
  profile: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5M17 4.5l1.2 1.2 2.3-2.3" /></>,
  editor: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M3.5 10h17M8 14h3M13 14h4" /></>,
  media: <><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="m5 17 4.5-4.5 3 3L15 13l4 4" /></>,
  versions: <><path d="M12 7v5l3 2" /><circle cx="12" cy="12" r="8" /><path d="M4 12H2M22 12h-2" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  arrow: <path d="M7 17 17 7M9 7h8v8" />,
};

function Icon({ name, className = "lp-icon" }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{ICONS[name]}</svg>;
}

const pipeline = ["Signals", "Research", "Setup", "Storyboard", "Voice", "Editor", "Export"];

const features = [
  { icon: "signal", title: "Live signal desk", text: "Browse what is heating up in science and technology, search the feed, filter by topic and sort by heat. Pick a signal to start directing." },
  { icon: "research", title: "Source-grounded research", text: "Voxora reads sources, extracts evidence, scores claims and flags contradictions, so your script starts from a brief you can inspect." },
  { icon: "setup", title: "Guided setup", text: "Choose duration, narrative, delivery and reach from clear options. Recommendations come from your research, and every choice can be changed later." },
  { icon: "scenes", title: "Scene-by-scene storyboard", text: "Review the script, narration and visuals for every scene. Edit wording, swap B-roll and regenerate before you spend a render." },
  { icon: "voice", title: "AI narration", text: "Pick a preset narrator and preview it before you commit. Narration is generated per scene and timed to word-synced captions." },
  { icon: "profile", title: "Your own voice profile", text: "Record guided passages with explicit consent to build a reusable narrator. Own voice only, adults only, deletable at any time." },
  { icon: "editor", title: "Advanced timeline editor", text: "Multi-track timeline with split, trim, snap, undo and redo, plus waveforms, fades, captions, overlays and an AI assistant for reversible edits." },
  { icon: "media", title: "Media library", text: "Upload your own images and video and reuse them across scenes and in the editor, alongside the visuals Voxora suggests." },
  { icon: "versions", title: "Versions and review links", text: "Save versions, restore an earlier cut and share a review link so someone else can watch before you publish." },
];

const showcases = [
  {
    id: "research", kicker: "RESEARCH YOU CAN CHECK", title: "Know where every claim came from.",
    text: "Voxora does not hand you a black box. Research is persisted as an evidence graph, so you can open a finding and see what supports it.",
    points: ["Sources are read and exact evidence passages are extracted.", "Each claim is scored; unverified claims are not used as factual grounding for your storyboard.", "Conflicting sources are flagged so you decide how the video handles them.", "Ask follow-up questions grounded in the research you already have."],
    Visual: ResearchVisual,
  },
  {
    id: "editor", kicker: "A REAL EDITOR WHEN YOU WANT ONE", title: "Polish the cut without touching your source.",
    text: "Open the Advanced Editor for a separate, editable timeline. Your storyboard stays exactly as you left it.",
    points: ["Video, narration, music, caption and overlay tracks with a 9:16 preview.", "Split, trim, move and reorder clips, with snap, undo/redo and keyboard shortcuts.", "Waveforms, per-clip volume, fades, transitions and motion presets.", "Autosave, plus an AI assistant that proposes changes you can undo."],
    Visual: EditorVisual, reverse: true,
  },
  {
    id: "voice", kicker: "YOUR VOICE, WITH YOUR CONSENT", title: "A narrator that sounds like you, if you choose.",
    text: "Voice cloning is optional and built around consent. It is intended for adults recording their own natural speaking voice.",
    points: ["Record guided passages inside Voxora after a separate consent step.", "Do not upload anyone else's voice, public figure or not.", "Delete a voice profile whenever you like from the voice library.", "Read how voice data is handled in the Privacy Policy and Terms."],
    Visual: VoiceVisual,
    links: [{ to: "/privacy", label: "Privacy Policy" }, { to: "/terms", label: "Terms & Conditions" }],
  },
  {
    id: "review", kicker: "VERSIONS & REVIEW", title: "Iterate with a safety net.",
    text: "Save a version before a big change, restore it if the new cut is worse, and share a review link to get a second opinion.",
    points: ["Numbered versions you can restore.", "A shareable review link for feedback before publishing.", "Reusable templates for projects you repeat."],
    Visual: ReviewVisual, reverse: true,
  },
];

const steps = [
  { title: "Create your free account", short: "Account", text: "Sign up with your email and verify it. The Free plan includes 3 video renders a month, so you can try the whole workflow.", points: ["Verify your email to enable paid checkout once plans open.", "Switch between light and dark themes from the top bar.", "Upgrade later from Account → Subscription & billing."], Visual: AccountVisual, cta: { to: "/signup", label: "Create free account" } },
  { title: "Pick a signal or bring a topic", short: "Signal", text: "Open the signal desk to see what is trending, or start research on a topic of your own.", points: ["Search the feed and filter by category.", "Sort by search heat, newest, oldest or title.", "Press Direct this Reel on a signal to start research."], Visual: SignalsVisual, cta: { to: "/signals", label: "Open the signal desk" } },
  { title: "Review the research", short: "Research", text: "Voxora plans the research, reads sources and verifies claims. You see live progress, then a report you can interrogate.", points: ["Inspect evidence behind each finding.", "Resolve flagged conflicts between sources.", "Ask follow-up questions or rerun a focused search."], Visual: ResearchVisual },
  { title: "Choose your setup", short: "Setup", text: "Make four quick choices and pick a narrator. Voxora recommends options based on your research.", points: ["Duration: 15, 30, 45 or 60 seconds.", "Narrative, delivery and reach shape the script.", "Pick a preset voice or one of your own voice profiles."], Visual: SetupVisual },
  { title: "Refine the storyboard", short: "Storyboard", text: "Voxora drafts the scenes. Adjust scripts, swap visuals and generate narration scene by scene.", points: ["Edit any line of the script.", "Replace B-roll from suggestions or your media library.", "Regenerate narration until it sounds right."], Visual: StoryboardVisual },
  { title: "Render and export", short: "Export", text: "Render the finished vertical video, then download the files you need.", points: ["Follow staged progress with elapsed time and ETA.", "Download the MP4, SRT captions and the script.", "Optional: polish first in the Advanced Editor."], Visual: ExportVisual, cta: { to: "/signup", label: "Start your first reel" } },
];

const plans = [
  { id: "free", name: "Free", description: "Explore the workflow", limit: "3 video renders / month", price: "$0", perks: ["Research workspace", "Storyboard and editor", "Up to 60 seconds per video"], cta: "Create free account" },
  { id: "creator", name: "Creator", description: "For regular short-form creators", limit: "30 video renders / month", price: "$19", perks: ["Everything in Free", "10× the monthly render allowance", "Up to 60 seconds per video"], cta: "Choose Creator", featured: true },
  { id: "studio", name: "Studio", description: "For teams publishing more often", limit: "150 video renders / month", price: "$49", perks: ["Everything in Creator", "5× the Creator render allowance", "Up to 60 seconds per video"], cta: "Explore Studio" },
];

const faqs = [
  { q: "Do I need an account?", a: "Yes. Create a free account to open the signal desk, start research and save projects. The Free plan needs no payment details." },
  { q: "How long can my videos be?", a: "Every plan supports videos up to 60 seconds. In setup you choose 15, 30, 45 or 60 seconds." },
  { q: "What counts as a render?", a: "Limits apply to completed render requests, not to projects, drafts or storyboard edits." },
  { q: "Can I clone any voice?", a: "No. Voice profiles are for adults recording their own voice, after an explicit consent step. Cloning someone else's voice is not allowed under the Terms." },
  { q: "Is the research always correct?", a: "No. AI output can be incomplete or wrong. That is why Voxora shows sources, evidence and conflicts, and why you review the script and visuals before publishing." },
  { q: "Can I buy a paid plan today?", a: "Paid-plan prices and limits are proposed for launch. Checkout opens after billing is configured and tested, and subscriptions are handled by Paddle." },
  { q: "Who makes Voxora?", a: "Voxora is a product of SL Options, a business registered in Sri Lanka. Contact details are on every legal page." },
];

function HowItWorks() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef([]);
  const step = steps[active];
  const { Visual } = step;

  function onKeyDown(event) {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : steps.length - 1;
      setActive(next); tabRefs.current[next]?.focus();
      return;
    }
    if (!keys[event.key]) return;
    event.preventDefault();
    const next = (active + keys[event.key] + steps.length) % steps.length;
    setActive(next); tabRefs.current[next]?.focus();
  }

  return (
    <div className="lp-how">
      <div className="lp-how__tabs" role="tablist" aria-label="How to use Voxora" aria-orientation="vertical" onKeyDown={onKeyDown}>
        {steps.map((item, index) => (
          <button key={item.title} ref={(node) => { tabRefs.current[index] = node; }} type="button" role="tab" id={`how-tab-${index}`} aria-selected={index === active} aria-controls="how-panel" tabIndex={index === active ? 0 : -1} className={index === active ? "is-active" : ""} onClick={() => setActive(index)}>
            <span className="lp-how__num">{String(index + 1).padStart(2, "0")}</span>
            <span className="lp-how__label"><strong>{item.short}</strong><small>{item.title}</small></span>
          </button>
        ))}
      </div>
      <div className="lp-how__panel" role="tabpanel" id="how-panel" aria-labelledby={`how-tab-${active}`} tabIndex={0}>
        <div className="lp-how__copy">
          <span className="lp-kicker">STEP {active + 1} OF {steps.length}</span>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
          <ul className="lp-points">{step.points.map((point) => <li key={point}><Icon name="check" className="lp-icon lp-icon--check" />{point}</li>)}</ul>
          <div className="lp-how__nav">
            {step.cta && <Link to={step.cta.to} className="btn btn-cream">{step.cta.label} <Icon name="arrow" className="lp-icon lp-icon--sm" /></Link>}
            <span className="lp-how__steppers">
              <button type="button" className="lp-step-btn" onClick={() => setActive((active - 1 + steps.length) % steps.length)} aria-label="Previous step">←</button>
              <button type="button" className="lp-step-btn" onClick={() => setActive((active + 1) % steps.length)} aria-label="Next step">→</button>
            </span>
          </div>
        </div>
        <div className="lp-how__visual"><Visual /></div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const { hash, pathname, key: locationKey } = useLocation();
  const destination = user ? "/my-research" : "/signup";

  // Router does not scroll to #hash by itself; the top bar and legal pages link here with hashes.
  useEffect(() => {
    const id = hash ? hash.slice(1) : pathname === "/pricing" ? "pricing" : "";
    if (!id) { if (!hash) window.scrollTo(0, 0); return undefined; }
    const timer = window.setTimeout(() => {
      const target = document.getElementById(id);
      if (!target) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [hash, pathname, locationKey]);

  return (
    <div className="hx-page lp">
      <PublicHeader />
      <main>
        <section className="lp-hero container" aria-labelledby="lp-title">
          <div className="lp-hero__copy">
            <span className="lp-tag"><span className="lp-dot" /> AI-ASSISTED VIDEO WORKSPACE</span>
            <h1 id="lp-title">From the first idea to the <em>final cut.</em></h1>
            <p className="lp-lede">Voxora takes a trending science or tech signal, researches it, writes the storyboard, narrates it and renders a vertical short video, all in one workspace.</p>
            <div className="lp-actions">
              <Link className="btn btn-cream lp-primary" to={destination}>{user ? "Open workspace" : "Start creating free"} <Icon name="arrow" className="lp-icon lp-icon--sm" /></Link>
              <Link className="btn btn-ghost lp-primary" to="/signals">Browse signals</Link>
              <a className="lp-secondary" href="#how-it-works">See how it works ↓</a>
            </div>
            <ul className="lp-trust" aria-label="Highlights">
              <li><Icon name="check" className="lp-icon lp-icon--check" />Free plan, no card needed</li>
              <li><Icon name="check" className="lp-icon lp-icon--check" />Source-grounded research</li>
              <li><Icon name="check" className="lp-icon lp-icon--check" />Your own voice only</li>
            </ul>
          </div>
          <div className="lp-hero__visual"><HeroVisual /></div>
        </section>

        <section className="lp-strip" aria-label="The Voxora pipeline">
          <div className="container">
            <ol className="lp-pipeline">{pipeline.map((name, index) => <li key={name}><span>{String(index + 1).padStart(2, "0")}</span>{name}</li>)}</ol>
          </div>
        </section>

        <section id="features" className="lp-section container">
          <div className="lp-heading"><div><p className="lp-kicker">FEATURES</p><h2>Everything between an idea and an upload.</h2></div><p>Plan, direct and polish every step with editorial control built in, not bolted on.</p></div>
          <div className="lp-features">
            {features.map((item) => <article key={item.title}><span className="lp-feature-icon"><Icon name={item.icon} /></span><h3>{item.title}</h3><p>{item.text}</p></article>)}
          </div>
        </section>

        <section className="lp-section lp-section--tint" aria-label="Feature details">
          <div className="container lp-showcases">
            {showcases.map(({ id, kicker, title, text, points, Visual, reverse, links }) => (
              <article key={id} className={`lp-showcase${reverse ? " lp-showcase--reverse" : ""}`}>
                <div className="lp-showcase__copy">
                  <p className="lp-kicker">{kicker}</p>
                  <h3>{title}</h3>
                  <p>{text}</p>
                  <ul className="lp-points">{points.map((point) => <li key={point}><Icon name="check" className="lp-icon lp-icon--check" />{point}</li>)}</ul>
                  {links && <p className="lp-inline-links">{links.map((link) => <Link key={link.to} to={link.to}>{link.label} ↗</Link>)}</p>}
                </div>
                <div className="lp-showcase__visual"><Visual /></div>
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="lp-section container">
          <div className="lp-heading"><div><p className="lp-kicker">HOW TO USE VOXORA</p><h2>Six steps from signup to MP4.</h2></div><p>Follow the workflow in order, or jump to the step you need. Each step shows what you will see in the app.</p></div>
          <HowItWorks />
        </section>

        <section id="pricing" className="lp-section lp-section--tint">
          <div className="container">
            <div className="lp-heading"><div><p className="lp-kicker">PRICING</p><h2>Find room for your next idea.</h2></div><p>Simple, render-based plans for creators at different stages.</p></div>
            <div className="lp-plans">
              {plans.map((plan) => (
                <article key={plan.id} className={plan.featured ? "lp-plan lp-plan--featured" : "lp-plan"}>
                  <span className="lp-plan__label">{plan.featured ? "MOST POPULAR" : "VOXORA PLAN"}</span>
                  <h3>{plan.name}</h3>
                  <p className="lp-plan__desc">{plan.description}</p>
                  <div className="lp-price">{plan.price}<span> / month</span></div>
                  <strong className="lp-quota">{plan.limit}</strong>
                  <ul>{plan.perks.map((perk) => <li key={perk}><Icon name="check" className="lp-icon lp-icon--check" />{perk}</li>)}</ul>
                  <Link className={plan.featured ? "btn btn-cream" : "btn btn-ghost"} to={plan.id === "free" ? destination : `/billing?plan=${plan.id}`}>{plan.cta} <Icon name="arrow" className="lp-icon lp-icon--sm" /></Link>
                </article>
              ))}
            </div>
            <p className="lp-pricing-note">Paid-plan prices and limits are proposed for launch and are not yet available for purchase. Checkout will open after billing is configured and tested. Limits apply to completed render requests, not projects or drafts. See the <Link to="/refund-policy">Refund Policy</Link> for cancellations and refunds.</p>
          </div>
        </section>

        <section id="faq" className="lp-section container">
          <div className="lp-heading"><div><p className="lp-kicker">QUESTIONS</p><h2>Good to know before you start.</h2></div></div>
          <div className="lp-faq">
            {faqs.map((item) => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
          </div>
        </section>

        <section className="lp-endcap container">
          <div className="lp-endcap__card">
            <div><p className="lp-kicker">START YOUR NEXT STORY</p><h2>Make something worth watching.</h2></div>
            <div className="lp-endcap__actions">
              <Link to={destination} className="btn btn-cream lp-primary">{user ? "Open workspace" : "Create free account"} <Icon name="arrow" className="lp-icon lp-icon--sm" /></Link>
              <Link to="/signals" className="btn btn-ghost lp-primary">Browse signals</Link>
            </div>
          </div>
        </section>
      </main>
      <LegalFooter />
    </div>
  );
}
