import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import "./ResearchConversationPage.css";

const TERMINAL = new Set(["ready", "error", "stopped"]);

function statusLabel(status) {
  return ({
    queued: "Starting research",
    planning: "Planning research",
    discovering: "Discovering sources",
    reading: "Reading sources",
    verifying: "Verifying evidence",
    synthesizing: "Building research brief",
    ready: "Research ready",
    error: "Research needs attention",
  })[status] || "Researching";
}

export default function ResearchConversationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activity, setActivity] = useState(null);
  const endRef = useRef(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/research-conversations/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to load research conversation.");
    setProject(data.project);
    setMessages(Array.isArray(data.messages) ? data.messages : []);
    setActivity(data.activity || null);
    setLoading(false);
    return data.project;
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    load().catch((err) => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [load]);

  useEffect(() => {
    if (!project || TERMINAL.has(project.researchStatus)) return undefined;
    const timer = window.setInterval(() => { load().catch(() => {}); }, 1800);
    return () => window.clearInterval(timer);
  }, [project, load]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, sending]);

  async function sendQuestion(event) {
    event?.preventDefault();
    const text = question.trim();
    if (!text || sending || project?.researchStatus !== "ready") return;
    setSending(true); setError("");
    setMessages((current) => [...current, { role: "user", content: text, optimistic: true }]);
    setQuestion("");
    try {
      const res = await fetch(`/api/research-conversations/${id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Helix could not answer that question.");
      setMessages(data.messages || []);
    } catch (err) {
      setMessages((current) => current.filter((message) => !message.optimistic));
      setError(err.message);
    } finally { setSending(false); }
  }

  if (loading) return <div className="hx-page"><Header /><main className="container rc-loading">Loading research workspace…</main></div>;
  if (!project) return <div className="hx-page"><Header /><main className="container rc-loading">{error || "Research workspace not found."}</main></div>;

  const ready = project.researchStatus === "ready";
  const canContinue = ready;
  const sources = Number(project.research?.deepResearch?.sources_discovered ?? project.research?.deepResearch?.sources_found ?? 0);
  const evidence = Number(project.research?.deepResearch?.evidence_count ?? 0);

  return (
    <div className="hx-page rc-page">
      <Header right={<button type="button" className="btn btn-ghost" onClick={() => navigate(`/research/${id}`)}>Open research report</button>} />
      <main className="container rc-shell">
        <div className="rc-heading">
          <div>
            <p className="eyebrow">Research with Helix</p>
            <h1>{project.title}</h1>
            <p>Investigate the topic through evidence-backed conversation. Helix researches first, then keeps follow-up answers grounded in the persisted research corpus.</p>
          </div>
          <span className={`rc-status rc-status--${project.researchStatus}`}>{statusLabel(project.researchStatus)}</span>
        </div>

        <div className="rc-workspace">
          <section className="rc-chat" aria-label="Research conversation">
            <div className="rc-chat__messages">
              {messages.length === 0 && <div className="rc-welcome"><span className="eyebrow">Start here</span><h2>What do you want to understand?</h2><p>Ask Helix to investigate a claim, compare evidence, find recent developments, or explain how something works.</p></div>}
              {messages.map((message, index) => (
                <article className={`rc-message rc-message--${message.role}`} key={`${message.role}-${index}`}>
                  <span className="rc-message__role">{message.role === "user" ? "You" : "Helix"}</span>
                  <div className="rc-message__body">{message.content}</div>
                  {message.sources?.length > 0 && <div className="rc-message__sources"><strong>{message.sources.length} sources</strong>{message.sources.slice(0, 3).map((source, sourceIndex) => <a key={`${source.url}-${sourceIndex}`} href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}</a>)}</div>}
                  {message.evidence?.length > 0 && <span className="rc-message__evidence">{message.evidence.length} evidence passages · corpus grounded</span>}
                </article>
              ))}
              {sending && <article className="rc-message rc-message--assistant rc-message--typing"><span className="rc-message__role">Helix</span><div>Reviewing the persisted evidence…</div></article>}
              <div ref={endRef} />
            </div>
            {!ready && <div className="rc-researching"><span className="rc-spinner" aria-hidden="true" /> {statusLabel(project.researchStatus)} — {activity?.detail || project.researchStageDetail || "Helix is working through the evidence pipeline."}</div>}
            {error && <p className="rc-error" role="alert">{error}</p>}
            <form className="rc-composer" onSubmit={sendQuestion}>
              <textarea value={question} onChange={(event) => setQuestion(event.target.value)} disabled={!ready || sending} placeholder={ready ? "Ask another research question…" : "Helix is researching the topic first…"} maxLength={2000} rows={3} aria-label="Research question" />
              <div className="rc-composer__footer"><span>{ready ? "Answers use the persisted research corpus." : "Deep research must finish before follow-up questions."}</span><button className="btn btn-cream" type="submit" disabled={!ready || sending || !question.trim()}>{sending ? "Researching…" : "Ask Helix"}</button></div>
            </form>
          </section>

          <aside className="rc-brief" aria-label="Research brief">
            <div className="rc-brief__head"><div><span className="eyebrow">Working brief</span><h2>Research memory</h2></div><span className="rc-brief__dot" aria-label="Persisted research" /></div>
            <p className="rc-brief__topic">{project.title}</p>
            <div className="rc-metrics"><div><strong>{sources || "—"}</strong><span>sources</span></div><div><strong>{evidence || "—"}</strong><span>evidence</span></div><div><strong>{ready ? "Ready" : "…"}</strong><span>status</span></div></div>
            <div className="rc-brief__note"><strong>How this works</strong><p>Your conversation adds research direction. Helix does not treat chat text as verified fact; answers are grounded in the persisted source/evidence corpus.</p></div>
            <button type="button" className="btn btn-cream rc-continue" disabled={!canContinue} onClick={() => navigate(`/research/${id}`)}>Build brief &amp; continue →</button>
            <button type="button" className="btn btn-ghost rc-secondary" onClick={() => navigate("/")}>Back to Signals</button>
          </aside>
        </div>
      </main>
    </div>
  );
}
