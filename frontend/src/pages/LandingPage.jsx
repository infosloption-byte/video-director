import { Link } from "react-router-dom";
import Header from "../components/Header";
import { useAuth } from "../context/AuthContext";
import "./LandingPage.css";

const flow = [
  { number:"01", title:"Discover a story worth telling", detail:"Explore signals or start with a topic. Voxora organizes sources and research so you can work from a stronger brief." },
  { number:"02", title:"Shape the storyboard", detail:"Choose the angle, structure and tone. Refine scenes, visuals, script and narration in one workspace." },
  { number:"03", title:"Produce and export", detail:"Generate narration, arrange footage, add captions and render a shareable short-form video." },
];
const capabilities = [
  { icon:"⌕", title:"Research-first creation", text:"Go from source material and evidence to a clear editorial direction." },
  { icon:"▦", title:"Scene-by-scene control", text:"Review your storyboard, scripts and media before rendering." },
  { icon:"◉", title:"AI narration", text:"Select voices for your video; voice-cloning features depend on service availability." },
  { icon:"▣", title:"Editor and export", text:"Polish timing, audio and captions, then render an MP4 for your channel." },
];
const plans=[
  { name:"Free", description:"Explore the workflow", limit:"3 video renders / month", price:"$0", perks:["Research workspace","Storyboard and editor","60-second maximum length"], cta:"Create free account", featured:false },
  { name:"Creator", description:"For regular short-form creators", limit:"30 video renders / month", price:"$19", perks:["Everything in Free","Increased monthly render allowance","Voice and editing workflow"], cta:"Choose Creator", featured:true },
  { name:"Studio", description:"For teams publishing more often", limit:"150 video renders / month", price:"$49", perks:["Everything in Creator","Highest proposed render allowance","Priority capacity planning"], cta:"Explore Studio", featured:false },
];
export default function LandingPage() {
  const { user } = useAuth();
  const destination = user ? "/my-research" : "/signup";
  return <div className="hx-page lp"><Header right={<a href="#pricing" className="btn btn-ghost">Pricing</a>} />
    <main>
      <section className="lp-hero container">
        <div className="lp-hero__copy">
          <span className="lp-tag"><span className="lp-dot" /> AI-ASSISTED VIDEO WORKSPACE</span>
          <h1>From the first idea to the <em>final cut.</em></h1>
          <p>Research what matters, build a compelling story, create narration and edit a finished short-form video—all inside Voxora.</p>
          <div className="lp-actions"><Link className="btn btn-cream lp-primary" to={destination}>{user?"Open workspace":"Start creating free"} <span aria-hidden="true">↗</span></Link><a className="lp-secondary" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a></div>
          <p className="lp-note">Built for research-driven short videos. AI services and rendering are subject to availability.</p>
        </div>
        <div className="lp-demo" aria-label="Illustration of the Voxora creation process">
          <div className="lp-demo__top"><span><b className="lp-demo__indicator"/> VOXORA STUDIO</span><span>PROJECT / 001</span></div>
          <div className="lp-demo__screen"><span className="lp-demo__pill">STORYBOARD · 00:60</span><div className="lp-demo__play">▶</div><h3>Your next story starts here.</h3><p>RESEARCH → SCRIPT → NARRATE → EXPORT</p></div>
          <div className="lp-demo__track">{["Research","Storyboard","Narration","Final cut"].map((step,i)=><div key={step}><span>{String(i+1).padStart(2,"0")}</span><strong>{step}</strong><i /></div>)}</div>
          <div className="lp-demo__footer"><span>ONE WORKSPACE. YOUR VISION.</span><span>◉ READY TO CREATE</span></div>
        </div>
      </section>
      <section className="lp-strip"><div className="container lp-strip__inner"><span>RESEARCH</span><span>STORYBOARD</span><span>VOICE</span><span>VIDEO EDITOR</span><span>EXPORT</span></div></section>
      <section id="how-it-works" className="lp-section container"><p className="lp-kicker">THE WORKFLOW</p><div className="lp-heading"><h2>One clear path to a better video.</h2><p>Voxora brings the messy pieces of production together, so you can focus on what your story needs to say.</p></div><div className="lp-steps">{flow.map(x=><article key={x.number}><span className="lp-stepnum">{x.number} /</span><h3>{x.title}</h3><p>{x.detail}</p></article>)}</div></section>
      <section className="lp-section lp-capabilities"><div className="container"><p className="lp-kicker">THE TOOLKIT</p><div className="lp-heading"><h2>More than a video generator.</h2><p>Plan, direct and polish each step with editorial control built in.</p></div><div className="lp-features">{capabilities.map(x=><article key={x.title}><span className="lp-feature-icon">{x.icon}</span><h3>{x.title}</h3><p>{x.text}</p></article>)}</div></div></section>
      <section id="pricing" className="lp-section container"><p className="lp-kicker">PRICING</p><div className="lp-heading"><h2>Find room for your next idea.</h2><p>Transparent, render-based plans designed for creators at different stages.</p></div><div className="lp-plans">{plans.map(p=><article key={p.name} className={p.featured?"lp-plan lp-plan--featured":"lp-plan"}><span className="lp-plan__label">{p.featured?"MOST POPULAR":"VOXORA PLAN"}</span><h3>{p.name}</h3><p>{p.description}</p><div className="lp-price">{p.price}<span> / month</span></div><strong className="lp-quota">{p.limit}</strong><ul>{p.perks.map(item=><li key={item}>✓ {item}</li>)}</ul><Link className={p.featured?"btn btn-cream":"btn btn-ghost"} to={p.name==="Free"?destination:`/billing?plan=${p.name.toLowerCase()}`}>{p.cta} ↗</Link></article>)}</div><p className="lp-pricing-note">Paid-plan prices and limits are proposed for launch and are not yet available for purchase. Checkout will open after billing is configured and tested. Limits apply to completed render requests, not projects or drafts.</p></section>
      <section className="lp-endcap container"><div><p className="lp-kicker">START YOUR NEXT STORY</p><h2>Make something worth watching.</h2></div><Link to={destination} className="btn btn-cream">Open Voxora ↗</Link></section>
    </main><footer className="lp-footer container"><span>V / VOXORA</span><span>Research. Direct. Create.</span><span>© {new Date().getFullYear()} Voxora</span></footer>
  </div>;
}
