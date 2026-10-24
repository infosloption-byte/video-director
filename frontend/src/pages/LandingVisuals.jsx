/*
 * Illustrative product graphics for the landing page.
 * They are built from HTML/CSS (not images) so text reflows on small screens,
 * follows the light/dark theme, and never needs a network request.
 * All figures shown are examples, not live data.
 */

function waveHeights(count, seed = 1) {
  return Array.from({ length: count }, (_, i) => {
    const value = Math.abs(Math.sin(i * 1.7 + seed) * Math.cos(i * 0.53 + seed * 2));
    return 16 + Math.round(value * 78);
  });
}

function Wave({ count = 36, seed = 1, className = "" }) {
  return <span className={`lv-wave ${className}`} aria-hidden="true">{waveHeights(count, seed).map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</span>;
}

function Frame({ label, tag, children, className = "" }) {
  return (
    <figure className={`lv ${className}`} aria-label={label}>
      <div className="lv__bar"><span className="lv-dots" aria-hidden="true"><i /><i /><i /></span><span className="lv__title">{tag}</span><span className="lv__example">Example</span></div>
      <div className="lv__body">{children}</div>
    </figure>
  );
}

export function HeroVisual() {
  return (
    <figure className="lv lv--hero" aria-label="Illustration of the Voxora workspace showing a vertical video preview, research summary, narration and editing timeline">
      <div className="lv__bar"><span className="lv-dots" aria-hidden="true"><i /><i /><i /></span><span className="lv__title">VOXORA STUDIO</span><span className="lv__example">Example project</span></div>
      <div className="lv-hero__grid">
        <div className="lv-phone" aria-hidden="true">
          <div className="lv-phone__screen">
            <span className="lv-phone__tag">SCENE 3 / 7</span>
            <div className="lv-phone__art"><svg viewBox="0 0 120 120" focusable="false"><circle cx="60" cy="60" r="38" /><circle cx="60" cy="60" r="24" /><circle cx="60" cy="60" r="10" /><path d="M60 14v18M60 88v18M14 60h18M88 60h18" /></svg></div>
            <p className="lv-phone__caption"><em>Solid-state</em> cells could charge in minutes</p>
            <span className="lv-phone__play">▶</span>
            <span className="lv-phone__progress"><i /></span>
          </div>
        </div>
        <div className="lv-stack">
          <div className="lv-card">
            <span className="lv-label">01 · SIGNAL</span>
            <strong>Solid-state batteries</strong>
            <span className="lv-heat"><i style={{ width: "86%" }} /></span>
            <small>Search heat 86%</small>
          </div>
          <div className="lv-card">
            <span className="lv-label">02 · RESEARCH</span>
            <strong>12 sources read · 31 claims</strong>
            <span className="lv-chips"><b className="ok">24 verified</b><b className="warn">2 conflicts</b></span>
          </div>
          <div className="lv-card">
            <span className="lv-label">03 · NARRATION</span>
            <strong>Narrator voice · 0:48</strong>
            <Wave count={30} seed={3} />
          </div>
          <div className="lv-card">
            <span className="lv-label">04 · EXPORT</span>
            <strong>MP4 · 1080×1920 · 0:48</strong>
            <span className="lv-chips"><b>SRT captions</b><b>Script</b></span>
          </div>
        </div>
      </div>
      <div className="lv-timeline" aria-hidden="true">
        <div className="lv-track"><span>B-ROLL</span><div><i style={{ flex: 3 }} /><i style={{ flex: 2 }} /><i style={{ flex: 4 }} /><i style={{ flex: 2 }} /></div></div>
        <div className="lv-track"><span>VOICE</span><div><Wave count={60} seed={5} className="lv-wave--track" /></div></div>
        <div className="lv-track"><span>CAPTIONS</span><div className="lv-track__caps"><i style={{ flex: 2 }} /><i style={{ flex: 3 }} /><i style={{ flex: 2 }} /><i style={{ flex: 3 }} /><i style={{ flex: 2 }} /></div></div>
        <span className="lv-playhead" />
      </div>
    </figure>
  );
}

export function AccountVisual() {
  return (
    <Frame label="Illustration of creating a free account and verifying an email address" tag="CREATE ACCOUNT" className="lv--narrow">
      <div className="lv-field"><span className="lv-label">EMAIL</span><div className="lv-input">you@example.com</div></div>
      <div className="lv-field"><span className="lv-label">PASSWORD</span><div className="lv-input">••••••••••••</div></div>
      <div className="lv-row"><span className="lv-pill lv-pill--ok">✓ Email verified</span><span className="lv-pill">Free plan · 3 renders / month</span></div>
      <div className="lv-btn">Open workspace ↗</div>
    </Frame>
  );
}

export function SignalsVisual() {
  const rows = [
    { n: "01", t: "Solid-state batteries edge toward production", c: "ENERGY", h: 92 },
    { n: "02", t: "A new approach to protein design", c: "BIOTECH", h: 78 },
    { n: "03", t: "Why small language models are catching up", c: "AI", h: 64 },
  ];
  return (
    <Frame label="Illustration of a ranked list of trending science and technology signals" tag="SIGNAL DESK" >
      <div className="lv-search"><span aria-hidden="true">⌕</span> Search science &amp; tech signals…</div>
      <div className="lv-chips lv-chips--filters"><b className="on">All</b><b>AI</b><b>Energy</b><b>Space</b><b>Biotech</b></div>
      {rows.map((r) => (
        <div className="lv-signal" key={r.n}>
          <span className="lv-signal__n">{r.n}</span>
          <div><strong>{r.t}</strong><span className="lv-signal__meta"><b>{r.c}</b><span className="lv-heat lv-heat--sm"><i style={{ width: `${r.h}%` }} /></span>{r.h}%</span></div>
          <span className="lv-btn lv-btn--sm">Direct ↗</span>
        </div>
      ))}
    </Frame>
  );
}

export function ResearchVisual() {
  return (
    <Frame label="Illustration of source-grounded research with verified claims, evidence and a flagged conflict" tag="RESEARCH REPORT">
      <div className="lv-metrics"><span><b>12</b>sources</span><span><b>31</b>claims</span><span><b>24</b>verified</span><span className="warn"><b>2</b>conflicts</span></div>
      <div className="lv-claim"><span className="lv-pill lv-pill--ok">High confidence</span><p>Pilot cells report a faster charge than comparable lithium-ion packs.</p><small>3 sources · 2 evidence passages</small></div>
      <div className="lv-claim"><span className="lv-pill lv-pill--mid">Medium</span><p>Mass production is expected within several years.</p><small>2 sources · timelines vary</small></div>
      <div className="lv-claim lv-claim--conflict"><span className="lv-pill lv-pill--warn">Conflict flagged</span><p>Sources disagree on expected cycle life.</p><small>Review both sides before you script it</small></div>
    </Frame>
  );
}

export function SetupVisual() {
  const groups = [
    { k: "DURATION", o: ["15s", "30s", "45s", "60s"], on: 3 },
    { k: "NARRATIVE", o: ["Explainer", "Story", "Myth vs fact"], on: 0 },
    { k: "DELIVERY", o: ["Curious", "Authoritative", "Playful"], on: 0 },
    { k: "REACH", o: ["General", "Students", "Experts"], on: 0 },
  ];
  return (
    <Frame label="Illustration of guided setup choices for duration, narrative, delivery and reach" tag="GUIDED SETUP">
      {groups.map((g) => (
        <div className="lv-group" key={g.k}>
          <span className="lv-label">{g.k}</span>
          <div className="lv-chips">{g.o.map((o, i) => <b key={o} className={i === g.on ? "on" : ""}>{o}</b>)}</div>
        </div>
      ))}
      <div className="lv-group"><span className="lv-label">NARRATOR</span><div className="lv-voice"><span className="lv-voice__play">▶</span><div><strong>Choose a voice</strong><small>Preset voices or your own voice profile</small></div></div></div>
    </Frame>
  );
}

export function StoryboardVisual() {
  const scenes = [
    { n: 1, t: "What if a phone charged in minutes?", d: "0:06" },
    { n: 2, t: "Inside a solid-state cell, the liquid is replaced.", d: "0:09" },
    { n: 3, t: "Here is what still stands in the way.", d: "0:08" },
  ];
  return (
    <Frame label="Illustration of a storyboard with scene scripts, narration and visuals" tag="STORYBOARD">
      {scenes.map((s) => (
        <div className="lv-scene" key={s.n}>
          <span className={`lv-scene__thumb lv-scene__thumb--${s.n}`} aria-hidden="true"><b>{String(s.n).padStart(2, "0")}</b></span>
          <div><strong>{s.t}</strong><span className="lv-scene__meta"><Wave count={18} seed={s.n + 1} className="lv-wave--sm" />{s.d}<em>Narration ✓</em></span></div>
        </div>
      ))}
      <div className="lv-row"><span className="lv-pill">Edit script</span><span className="lv-pill">Swap B-roll</span><span className="lv-pill">Regenerate voice</span></div>
    </Frame>
  );
}

export function EditorVisual() {
  return (
    <Frame label="Illustration of the advanced editor timeline with video, narration, caption and overlay tracks" tag="ADVANCED EDITOR" className="lv--editor">
      <div className="lv-toolbar" aria-hidden="true"><b>Select</b><b>Split</b><b>Trim</b><b>Undo</b><b>Redo</b><span className="lv-grow" /><b className="on">Snap: grid</b></div>
      <div className="lv-ruler" aria-hidden="true">{["0:00", "0:10", "0:20", "0:30", "0:40", "0:50"].map((t) => <span key={t}>{t}</span>)}</div>
      <div className="lv-timeline lv-timeline--editor" aria-hidden="true">
        <div className="lv-track"><span>B-ROLL</span><div><i style={{ flex: 3 }} /><i style={{ flex: 2 }} /><i style={{ flex: 4 }} /><i style={{ flex: 3 }} /></div></div>
        <div className="lv-track"><span>VOICE</span><div><Wave count={70} seed={7} className="lv-wave--track" /></div></div>
        <div className="lv-track"><span>MUSIC</span><div><Wave count={70} seed={11} className="lv-wave--track lv-wave--muted" /></div></div>
        <div className="lv-track"><span>CAPTIONS</span><div className="lv-track__caps"><i style={{ flex: 2 }} /><i style={{ flex: 3 }} /><i style={{ flex: 2 }} /><i style={{ flex: 3 }} /><i style={{ flex: 2 }} /></div></div>
        <div className="lv-track"><span>OVERLAYS</span><div className="lv-track__caps lv-track__caps--sparse"><i style={{ flex: 1 }} /><i style={{ flex: 0.6, visibility: "hidden" }} /><i style={{ flex: 1.4 }} /></div></div>
        <span className="lv-playhead" />
      </div>
    </Frame>
  );
}

export function VoiceVisual() {
  return (
    <Frame label="Illustration of the voice profile consent steps for recording your own voice" tag="VOICE PROFILE" className="lv--narrow">
      <ul className="lv-checks">
        <li><b>✓</b> I am recording my own voice</li>
        <li><b>✓</b> I am 18 or older</li>
        <li><b>✓</b> I understand a reusable synthetic reference is created</li>
      </ul>
      <div className="lv-recorder"><span className="lv-rec" aria-hidden="true" /><Wave count={34} seed={9} /><small>Guided passage 2</small></div>
      <div className="lv-row"><span className="lv-pill lv-pill--ok">Consent recorded</span><span className="lv-pill">Delete any time</span></div>
    </Frame>
  );
}

export function ExportVisual() {
  const stages = [
    { t: "Narration", s: "done" },
    { t: "B-roll and captions", s: "done" },
    { t: "Rendering video", s: "active" },
    { t: "Finalizing MP4", s: "wait" },
  ];
  return (
    <Frame label="Illustration of render progress and export files: MP4, SRT captions and script" tag="RENDER & EXPORT">
      <div className="lv-progress"><div className="lv-progress__head"><strong>Rendering your reel</strong><span>72%</span></div><span className="lv-heat"><i style={{ width: "72%" }} /></span></div>
      <ol className="lv-stages">{stages.map((s) => <li key={s.t} className={`is-${s.s}`}><b>{s.s === "done" ? "✓" : s.s === "active" ? "…" : ""}</b>{s.t}</li>)}</ol>
      <div className="lv-files"><span><b>MP4</b>9:16 video</span><span><b>SRT</b>Captions</span><span><b>TXT</b>Script</span></div>
    </Frame>
  );
}

export function ReviewVisual() {
  return (
    <Frame label="Illustration of saved versions and a shareable review link" tag="VERSIONS & REVIEW" className="lv--narrow">
      <div className="lv-version is-current"><b>v3</b><div><strong>Tightened intro</strong><small>Current version</small></div></div>
      <div className="lv-version"><b>v2</b><div><strong>New B-roll for scene 4</strong><small>Restore available</small></div></div>
      <div className="lv-version"><b>v1</b><div><strong>First draft</strong><small>Restore available</small></div></div>
      <div className="lv-input lv-input--link">🔗 Review link · share for feedback</div>
    </Frame>
  );
}
