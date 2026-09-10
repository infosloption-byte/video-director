import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import "./ResearchConversationPage.css";

const TERMINAL = new Set(["ready", "error", "stopped"]);

function statusLabel(status) {
  return ({ queued: "Starting research", planning: "Planning research", discovering: "Discovering sources", reading: "Reading sources", verifying: "Verifying evidence", synthesizing: "Building research brief", ready: "Research ready", error: "Research needs attention", stopped: "Research stopped" })[status] || "Researching";
}

function sourceLabel(source = {}) {
  try { return new URL(source.url).hostname.replace(/^www\./, ""); } catch { return source.url || "Source"; }
}

function initialAssistantMessage(project) {
  const research = project?.research && typeof project.research === "object" ? project.research : {};
  const content = String(research.executive_summary || research.mechanism_summary || research.what_happened || "The initial research pass is complete. You can now ask follow-up questions against the research memory.").trim();
  return {
    id: `initial-assistant-${project?.id || "research"}`,
    role: "assistant",
    content,
    sources: Array.isArray(research.sources) ? research.sources.slice(0, 5) : [],
    grounded: true,
    source: "deep-research",
  };
}

function pendingInitialMessage(projectId) {
  return { id: `initial-assistant-${projectId}`, role: "assistant", content: "I’m researching this topic across relevant sources. I’ll bring the evidence-backed findings back into this conversation when the first pass is complete.", researchPending: true, grounded: false, sources: [], evidence: [] };
}

function withInitialConversationMessage(project, storedMessages = []) {
  const messages = Array.isArray(storedMessages) ? [...storedMessages] : [];
  if (!project?.id) return messages;
  const pendingIndex = messages.findIndex((message) => message?.researchPending && message.role === "assistant");
  const assistantIndex = messages.findIndex((message) => message?.role === "assistant" && !message.researchPending);
  if (project.researchStatus === "ready") {
    if (pendingIndex >= 0) messages.splice(pendingIndex, 1, initialAssistantMessage(project));
    else if (assistantIndex < 0) messages.push(initialAssistantMessage(project));
  } else if (!TERMINAL.has(project.researchStatus) && pendingIndex < 0) {
    messages.push(pendingInitialMessage(project.id));
  }
  return messages;
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
  const [streamConnected, setStreamConnected] = useState(false);
  const messagesRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const reloadRef = useRef(null);

  const scrollMessagesToBottom = useCallback((behavior = "smooth") => {
    const node = messagesRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const node = messagesRef.current;
    if (!node) return;
    stickToBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
  }, []);

  const load = useCallback(async () => {
    await Promise.resolve();
    try {
      const res = await fetch(`/api/research-conversations/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load research conversation.");
      setProject(data.project);
      setMessages(withInitialConversationMessage(data.project, data.messages));
      setActivity(data.activity || null);
      setLoading(false);
      setError("");
      return data.project;
    } catch (err) {
      setError(err.message || "Failed to load research conversation.");
      setLoading(false);
      throw err;
    }
  }, [id]);

  useEffect(() => { void load(); return undefined; }, [load]);

  useEffect(() => {
    const stream = new EventSource(`/api/research-conversations/${id}/events`);
    let fallbackTimer = null;
    const parse = (event) => { try { return JSON.parse(event.data); } catch { return null; } };
    const refresh = () => { load().catch(() => {}); };

    stream.addEventListener("open", () => {
      setStreamConnected(true);
      if (fallbackTimer) { window.clearInterval(fallbackTimer); fallbackTimer = null; }
    });
    stream.addEventListener("snapshot", (event) => {
      const data = parse(event);
      if (!data) return;
      if (data.project) setProject(data.project);
      if (data.project) setMessages((current) => withInitialConversationMessage(data.project, current));
      if (data.activity) setActivity(data.activity);
    });
    stream.addEventListener("job", (event) => {
      const data = parse(event);
      if (!data) return;
      setActivity((current) => ({ ...(current || {}), ...data }));
      setProject((current) => current ? { ...current, researchStatus: data.status, researchProgress: data.progress, researchStageDetail: data.detail } : current);
      if (data.status === "ready") refresh();
    });
    stream.addEventListener("activity", (event) => {
      const item = parse(event);
      if (!item) return;
      setActivity((current) => ({ ...(current || {}), activity: [...(current?.activity || []), item].slice(-120) }));
      if (item?.type === "message.completed" || item?.type === "message.failed") refresh();
    });
    stream.addEventListener("sources", (event) => {
      const data = parse(event);
      if (!Array.isArray(data)) return;
      setActivity((current) => ({ ...(current || {}), discoveredSources: data }));
    });
    stream.onerror = () => {
      setStreamConnected(false);
      if (!fallbackTimer) fallbackTimer = window.setInterval(refresh, 2500);
    };
    reloadRef.current = refresh;
    return () => {
      if (fallbackTimer) window.clearInterval(fallbackTimer);
      stream.close();
      reloadRef.current = null;
    };
  }, [id, load]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const frame = window.requestAnimationFrame(() => scrollMessagesToBottom("smooth"));
    return () => window.cancelAnimationFrame(frame);
  }, [messages, activity?.activity?.length, scrollMessagesToBottom]);

  async function sendQuestion(event) {
    event?.preventDefault(); const text = question.trim();
    if (!text || sending || project?.researchStatus !== "ready") return;
    setSending(true); setError(""); stickToBottomRef.current = true;
    setMessages((current) => [...current.filter((message) => !message.optimistic), { id: `optimistic-${Date.now()}`, role: "user", content: text, optimistic: true }]);
    setQuestion("");
    try {
      const res = await fetch(`/api/research-conversations/${id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Helix could not answer that question.");
      setMessages(data.messages || []);
      if (data.project) setProject(data.project);
      if (data.activity) setActivity(data.activity);
    } catch (err) {
      setMessages((current) => current.filter((message) => !message.optimistic));
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (loading) return <div className="hx-page"><Header /><main className="container rc-loading">Loading research workspace…</main></div>;
  if (!project) return <div className="hx-page"><Header /><main className="container rc-loading">{error || "Research workspace not found."}</main></div>;

  const ready = project.researchStatus === "ready";
  const liveResearch = !ready && !TERMINAL.has(project.researchStatus);
  const sourceCount = Array.isArray(project.research?.sources) ? project.research.sources.length : 0;
  const evidenceCount = Number(project.research?.research_metrics?.evidence_passages ?? project.research?.evidence_passages ?? 0);
  const liveEvents = Array.isArray(activity?.activity) ? activity.activity.slice(-6).reverse() : [];
  const liveSources = Array.isArray(activity?.discoveredSources) ? activity.discoveredSources : [];
  const activeMessageId = activity?.messageId;

  return (
    <div className="hx-page rc-page">
      <Header right={<button type="button" className="btn btn-ghost" onClick={() => navigate(`/research/${id}`)}>Open research report</button>} />
      <main className="container rc-shell">
        <div className="rc-heading">
          <div><p className="eyebrow">Research with Helix</p><h1>{project.title}</h1><p>Investigate the topic through evidence-backed conversation. Helix researches first, then keeps follow-up answers grounded in the persisted research corpus.</p></div>
          <span className={`rc-status rc-status--${project.researchStatus}`}><span className="rc-status__dot" aria-hidden="true" />{statusLabel(project.researchStatus)}</span>
        </div>
        <div className="rc-workspace">
          <section className="rc-chat" aria-label="Research conversation">
            <div ref={messagesRef} className="rc-chat__messages" onScroll={handleMessagesScroll}>
              {messages.length === 0 && <div className="rc-welcome"><span className="eyebrow">Start here</span><h2>What do you want to understand?</h2><p>Ask Helix to investigate a claim, compare evidence, find recent developments, or explain how something works.</p></div>}
              {messages.map((message, index) => <article className={`rc-message rc-message--${message.role}${message.researchPending ? " rc-message--pending" : ""}`} key={message.id || `${message.role}-${index}`}>
                <span className="rc-message__role">{message.role === "user" ? "You" : "Helix"}</span>
                <div className="rc-message__body">{message.researchPending ? "I’m researching this topic across the evidence pipeline rather than guessing. The completed answer will appear here." : message.content}</div>
                {message.researchPending && activeMessageId === message.id && <div className="rc-message__live"><span className="rc-spinner" aria-hidden="true" /><span>Research in progress</span><span className="rc-message__live-status">{statusLabel(activity?.status || project.researchStatus)}</span></div>}
                {message.sources?.length > 0 && <div className="rc-message__sources"><strong>{message.sources.length} sources</strong>{message.sources.slice(0, 3).map((source, sourceIndex) => <a key={`${source.url}-${sourceIndex}`} href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}</a>)}</div>}
                {message.evidence?.length > 0 && <span className="rc-message__evidence">{message.evidence.length} evidence passages · corpus grounded</span>}
              </article>)}
              {liveResearch && <section className="rc-live" aria-live="polite" aria-label="Live research activity">
                <div className="rc-live__header">
                  <div><span className="eyebrow">Live research</span><strong>{statusLabel(activity?.status || project.researchStatus)}</strong></div>
                  <span className="rc-live__connection">{streamConnected ? "Live" : "Reconnecting…"}</span>
                </div>
                <div className="rc-live__progress"><span style={{ width: `${Math.max(0, Math.min(100, Number(activity?.progress ?? project.researchProgress ?? 0)))}%` }} /></div>
                <p className="rc-live__detail">{activity?.detail || project.researchStageDetail || "Helix is working through the evidence pipeline."}</p>
                {liveSources.length > 0 && <div className="rc-live__sources"><div className="rc-live__subhead"><span>Sources surfaced</span><strong>{liveSources.length}</strong></div><div className="rc-live__source-list">{liveSources.slice(-6).reverse().map((source) => <a key={source.url} className="rc-live__source" href={source.url} target="_blank" rel="noreferrer"><span>{source.title}</span><small>{sourceLabel(source)}</small></a>)}</div></div>}
                {liveEvents.length > 0 && <div className="rc-live__events"><div className="rc-live__subhead"><span>Activity</span><strong>{activity.activity?.length}</strong></div>{liveEvents.map((item) => <div className="rc-live__event" key={item.id}><span className="rc-live__event-dot" aria-hidden="true" /><div><strong>{item.message}</strong>{item.title && <span>{item.title}</span>}</div></div>)}</div>}
              </section>}
              <div aria-hidden="true" />
            </div>

            {!ready && project.researchStatus === "error" && <div className="rc-researching rc-researching--error" role="alert"><span>{activity?.detail || project.researchStageDetail || "Research needs attention."}</span></div>}
            {error && <p className="rc-error" role="alert">{error}</p>}
            <form className="rc-composer" onSubmit={sendQuestion}>
              <textarea value={question} onChange={(event) => setQuestion(event.target.value)} disabled={!ready || sending} placeholder={ready ? "Ask another research question…" : "The first evidence pass is running…"} maxLength={2000} rows={3} aria-label="Research question" />
              <div className="rc-composer__footer"><span>{ready ? "Answers use the persisted research corpus. Knowledge gaps trigger focused research." : "You can follow up as soon as the first research pass is ready."}</span><button className="btn btn-cream" type="submit" disabled={!ready || sending || !question.trim()}>{sending ? "Checking evidence…" : "Ask Helix"}</button></div>
            </form>
          </section>
          <aside className="rc-brief" aria-label="Research brief">
            <div className="rc-brief__head"><div><span className="eyebrow">Working brief</span><h2>Research memory</h2></div><span className="rc-brief__dot" aria-label="Persisted research" /></div>
            <p className="rc-brief__topic">{project.title}</p>
            <div className="rc-metrics"><div><strong>{sourceCount || "—"}</strong><span>sources</span></div><div><strong>{evidenceCount || "—"}</strong><span>evidence</span></div><div><strong>{ready ? "Ready" : "…"}</strong><span>status</span></div></div>
            <div className="rc-brief__note"><strong>How this works</strong><p>Your conversation adds research direction. Helix does not treat chat text as verified fact; answers are grounded in the persisted source/evidence corpus.</p></div>
            <button type="button" className="btn btn-cream rc-continue" disabled={!ready} onClick={() => navigate(`/storyboard/${id}?stage=setup`)}>Build brief &amp; continue to setup →</button>
            <button type="button" className="btn btn-ghost rc-secondary" onClick={() => navigate("/")}>Back to Signals</button>
          </aside>
        </div>
      </main>
    </div>
  );
}
