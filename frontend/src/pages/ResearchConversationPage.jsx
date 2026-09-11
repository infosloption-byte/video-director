import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import "./ResearchConversationPage.css";

const RESEARCH_STAGES = new Set(["queued", "planning", "discovering", "reading", "verifying", "synthesizing"]);

function statusLabel(status) {
  return ({
    conversation: "Conversation",
    planning: "Planning research",
    discovering: "Discovering sources",
    reading: "Reading sources",
    verifying: "Verifying evidence",
    synthesizing: "Building research brief",
    ready: "Research ready",
    error: "Research needs attention",
    stopped: "Research stopped"
  })[status] || "Researching";
}

function sourceLabel(source = {}) {
  try { return new URL(source.url).hostname.replace(/^www\\./, ""); } catch { return source.url || "Source"; }
}

function initialAssistantMessage(project) {
  const research = project?.research && typeof project.research === "object" ? project.research : {};
  const content = String(research.executive_summary || research.mechanism_summary || research.what_happened || "The evidence-backed research brief is ready. You can now ask follow-up questions against the research memory.").trim();
  return { id: `initial-assistant-${project?.id || "research"}`, role: "assistant", content, sources: Array.isArray(research.sources) ? research.sources.slice(0, 5) : [], grounded: true, source: "deep-research" };
}

function withInitialConversationMessage(project, storedMessages = []) {
  const messages = Array.isArray(storedMessages) ? [...storedMessages] : [];
  if (!project?.id || project.researchStatus !== "ready") return messages;
  const pendingIndex = messages.findIndex((message) => message?.researchPending && message.role === "assistant");
  const assistantIndex = messages.findIndex((message) => message?.role === "assistant" && !message.researchPending && message.grounded);
  if (pendingIndex >= 0) messages.splice(pendingIndex, 1, initialAssistantMessage(project));
  else if (assistantIndex < 0 && project.research) messages.push(initialAssistantMessage(project));
  return messages;
}

function renderInlineMarkdown(text) {
  const source = String(text || "");
  const tokenPattern = /(`[^`]+`|\\[[^\\]]+\\]\\([^)]*\\)|\\*\\*[^*]+\\*\\*|__[^_]+__|\\*[^*]+\\*|_[^_]+_)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = tokenPattern.exec(source))) {
    if (match.index > lastIndex) parts.push(source.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("`") && token.endsWith("`")) parts.push(<code key={`code-${match.index}`}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("[") && token.includes("](")) {
      const close = token.indexOf("](");
      const label = token.slice(1, close);
      const href = token.slice(close + 2, -1);
      parts.push(<a key={`link-${match.index}`} href={href} target="_blank" rel="noreferrer">{label}</a>);
    } else if ((token.startsWith("**") && token.endsWith("**")) || (token.startsWith("__") && token.endsWith("__"))) parts.push(<strong key={`strong-${match.index}`}>{token.slice(2, -2)}</strong>);
    else parts.push(<em key={`em-${match.index}`}>{token.slice(1, -1)}</em>);
    lastIndex = match.index + token.length;
  }
  if (lastIndex < source.length) parts.push(source.slice(lastIndex));
  return parts;
}

function MarkdownContent({ content }) {
  const lines = String(content || "").replace(/\\r\\n?/g, "\\n").split("\\n");
  const blocks = [];
  let paragraph = [];
  let list = [];
  let listType = null;
  let code = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(<p key={`p-${blocks.length}`}>{renderInlineMarkdown(paragraph.join(" ").trim())}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    const ListTag = listType === "ol" ? "ol" : "ul";
    blocks.push(<ListTag key={`list-${blocks.length}`}>{list.map((item, index) => <li key={`li-${index}`}>{renderInlineMarkdown(item)}</li>)}</ListTag>);
    list = [];
    listType = null;
  };
  const flushCode = () => {
    if (!code) return;
    blocks.push(<pre key={`pre-${blocks.length}`}><code>{code.text}</code></pre>);
    code = null;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("```") && !code) {
      flushParagraph();
      flushList();
      code = { text: "", language: trimmed.slice(3).trim() };
      return;
    }
    if (code) {
      if (trimmed === "```") flushCode();
      else code.text += `${line}\\n`;
      return;
    }
    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }
    const heading = trimmed.match(/^(#{1,3})\\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const Tag = heading[1].length === 1 ? "h3" : heading[1].length === 2 ? "h4" : "h5";
      blocks.push(<Tag key={`heading-${blocks.length}`}>{renderInlineMarkdown(heading[2])}</Tag>);
      return;
    }
    const unordered = trimmed.match(/^[-*+]\\s+(.+)$/);
    const ordered = trimmed.match(/^\\d+[.)]\\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const type = ordered ? "ol" : "ul";
      if (listType && listType !== type) flushList();
      listType = listType || type;
      list.push((unordered || ordered)[1]);
      return;
    }
    if (trimmed.startsWith(">")) {
      flushParagraph();
      flushList();
      blocks.push(<blockquote key={`quote-${blocks.length}`}>{renderInlineMarkdown(trimmed.replace(/^>\\s?/, ""))}</blockquote>);
      return;
    }
    if (/^([-*_])(?:\\s*\\1){2,}$/.test(trimmed)) {
      flushParagraph();
      flushList();
      blocks.push(<hr key={`hr-${blocks.length}`} />);
      return;
    }
    paragraph.push(trimmed);
  });

  flushParagraph();
  flushList();
  flushCode();
  return <div className="rc-markdown">{blocks}</div>;
}

export default function ResearchConversationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [buildingBrief, setBuildingBrief] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activity, setActivity] = useState(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const [thinkingElapsed, setThinkingElapsed] = useState(0);
  const [stoppedRequest, setStoppedRequest] = useState(null);
  const [activeMessageId, setActiveMessageId] = useState(null);
  const messagesRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const activeRequestRef = useRef(null);
  const pendingMessageIdRef = useRef(null);
  const initialStartedRef = useRef(false);
  const stoppingRef = useRef(false);
  const lastRequestRef = useRef(null);

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
    try {
      const res = await fetch(`/api/research-conversations/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load research conversation.");
      setProject(data.project);
      setMessages(withInitialConversationMessage(data.project, data.messages));
      setActivity(data.activity || null);
      setBuildingBrief(RESEARCH_STAGES.has(data.project?.researchStatus));
      setLoading(false);
      setError("");
      return data.project;
    } catch (err) {
      setError(err.message || "Failed to load research conversation.");
      setLoading(false);
      throw err;
    }
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

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
      if (data.project) {
        setProject(data.project);
        setMessages((current) => withInitialConversationMessage(data.project, current));
        setBuildingBrief(RESEARCH_STAGES.has(data.project.researchStatus));
        if (data.activity?.conversationThinking) setSending(true);
      }
      if (data.activity) setActivity(data.activity);
    });
    stream.addEventListener("conversation", (event) => {
      const data = parse(event);
      if (!data || !Array.isArray(data.messages)) return;
      setMessages(data.messages);
      const completed = data.messages.find((message) => message?.id === pendingMessageIdRef.current && !message.researchPending);
      if (completed || data.messages.some((message) => message?.role === "assistant" && message?.conversationOnly && !message.researchPending)) {
        setSending(false);
        pendingMessageIdRef.current = null;
        setActiveMessageId(null);
        setStoppedRequest(null);
      }
    });
    stream.addEventListener("job", (event) => {
      const data = parse(event);
      if (!data) return;
      setActivity((current) => ({ ...(current || {}), ...data }));
      setProject((current) => current ? { ...current, researchStatus: data.status, researchProgress: data.progress, researchStageDetail: data.detail } : current);
      setBuildingBrief(RESEARCH_STAGES.has(data.status));
      if (data.conversationThinking) setSending(true);
      if (!data.conversationThinking && data.status === "conversation") setSending(false);
      if (data.status === "ready" || data.status === "error") {
        setSending(false);
        setBuildingBrief(false);
        pendingMessageIdRef.current = null;
        setActiveMessageId(null);
        refresh();
      }
    });
    stream.addEventListener("activity", (event) => {
      const item = parse(event);
      if (!item) return;
      setActivity((current) => ({ ...(current || {}), activity: [...(current?.activity || []), item].slice(-120) }));
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
    return () => {
      if (fallbackTimer) window.clearInterval(fallbackTimer);
      stream.close();
    };
  }, [id, load]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const frame = window.requestAnimationFrame(() => scrollMessagesToBottom("smooth"));
    return () => window.cancelAnimationFrame(frame);
  }, [messages, activity?.activity?.length, scrollMessagesToBottom]);

  useEffect(() => {
    if (!sending) return undefined;
    const started = Date.now();
    const timer = window.setInterval(() => setThinkingElapsed(Math.floor((Date.now() - started) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [sending]);

  const submitQuestion = useCallback(async (text, { initial = false, existingUser = false, replaceMessageId = null } = {}) => {
    const value = String(text || "").trim();
    if (!value || !project || sending || buildingBrief) return;
    const conversationMode = project.researchStatus === "conversation";
    const ready = project.researchStatus === "ready" || project.researchStatus === "error";
    if (!conversationMode && !ready) return;

    setSending(true);
    setThinkingElapsed(0);
    setActiveMessageId(null);
    setStoppedRequest(null);
    setError("");
    stoppingRef.current = false;
    stickToBottomRef.current = true;
    const pendingId = `pending-${Date.now()}`;
    pendingMessageIdRef.current = pendingId;
    setActiveMessageId(pendingId);
    lastRequestRef.current = { value, initial };
    setMessages((current) => {
      const cleaned = current.filter((message) => message.id !== replaceMessageId);
      if (initial || existingUser) return [...cleaned, { id: pendingId, role: "assistant", content: initial ? "Helix is thinking through the research direction…" : "Helix is thinking through your question…", researchPending: true, grounded: false }];
      return [...cleaned.filter((message) => !message.optimistic), { id: `optimistic-${Date.now()}`, role: "user", content: value, optimistic: true }, { id: pendingId, role: "assistant", content: "Helix is thinking through your question…", researchPending: true, grounded: false }];
    });
    setQuestion("");

    const controller = new AbortController();
    activeRequestRef.current = controller;
    try {
      const res = await fetch(`/api/research-conversations/${id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: value, initial }), signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.stopped || stoppingRef.current || controller.signal.aborted) return;
        throw new Error(data.error || "Helix could not answer that question.");
      }
      if (data.messages) setMessages(data.messages);
      if (data.project) setProject(data.project);
      if (data.activity) setActivity(data.activity);
      if (!data.researchPending) {
        setSending(false);
        pendingMessageIdRef.current = null;
        setActiveMessageId(null);
        setStoppedRequest(null);
      }
    } catch (err) {
      if (controller.signal.aborted || stoppingRef.current) return;
      setMessages((current) => current.filter((message) => message.id !== pendingId && !message.optimistic));
      setError(err.message || "Helix could not answer that question.");
      setSending(false);
      pendingMessageIdRef.current = null;
      setActiveMessageId(null);
    } finally {
      if (activeRequestRef.current === controller) activeRequestRef.current = null;
    }
  }, [project, sending, buildingBrief, id]);

  useEffect(() => {
    if (loading || !project || project.researchStatus !== "conversation" || sending || buildingBrief || initialStartedRef.current) return undefined;
    const hasAssistant = messages.some((message) => message?.role === "assistant");
    const onlyTopic = messages.length === 1 && messages[0]?.role === "user" && messages[0]?.content === project.title;
    if (!hasAssistant && onlyTopic) {
      initialStartedRef.current = true;
      const timer = window.setTimeout(() => { void submitQuestion(project.title, { initial: true }); }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [loading, project, messages, sending, buildingBrief, submitQuestion]);

  async function stopGeneration() {
    if ((!sending && !buildingBrief) || stoppingRef.current) return;
    stoppingRef.current = true;
    setError("");
    const pendingId = pendingMessageIdRef.current;
    const lastRequest = lastRequestRef.current;
    if (pendingId && lastRequest) setStoppedRequest({ messageId: pendingId, ...lastRequest });
    try {
      await fetch(`/api/projects/${id}/research/stop`, { method: "POST" });
    } catch { /* the local request is still cancelled below */ }
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    pendingMessageIdRef.current = null;
    setSending(false);
    setThinkingElapsed(0);
    setBuildingBrief(false);
    setActiveMessageId(null);
    if (pendingId && lastRequest) {
      setMessages((current) => current.map((message) => message.id === pendingId ? { ...message, content: "This request was stopped before Helix finished answering.", researchPending: false, stopped: true, grounded: false } : message));
    }
    const refreshed = await load().catch(() => null);
    if (refreshed?.researchStatus === "error" && refreshed.research) setProject((current) => current ? { ...current, researchStatus: "ready", researchStageDetail: "Ready for another question." } : current);
    stoppingRef.current = false;
  }

  function retryStoppedRequest() {
    const retry = stoppedRequest;
    if (!retry) return;
    setStoppedRequest(null);
    void submitQuestion(retry.value, { initial: retry.initial, existingUser: !retry.initial, replaceMessageId: retry.messageId });
  }

  function handleComposerKeyDown(event) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (thinking) return;
    void submitQuestion(question);
  }

  async function buildBrief() {
    if (!project || buildingBrief || project.researchStatus !== "conversation") return;
    setBuildingBrief(true);
    setError("");
    stickToBottomRef.current = true;
    const systemMessage = { id: `brief-request-${Date.now()}`, role: "assistant", content: "I’m scanning our conversation now and turning your questions and priorities into the full evidence-backed research brief.", researchPending: true, grounded: false, sources: [], evidence: [] };
    pendingMessageIdRef.current = systemMessage.id;
    setActiveMessageId(systemMessage.id);
    setMessages((current) => [...current, systemMessage].slice(-60));
    try {
      const res = await fetch(`/api/research-conversations/${id}/brief`, { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to build the research brief.");
      if (data.project) setProject(data.project);
      if (Array.isArray(data.messages)) setMessages(data.messages);
      if (data.activity) setActivity(data.activity);
    } catch (err) {
      setBuildingBrief(false);
      pendingMessageIdRef.current = null;
      setActiveMessageId(null);
      setMessages((current) => current.filter((message) => message.id !== systemMessage.id));
      setError(err.message || "Failed to build the research brief.");
    }
  }

  if (loading) return <div className="hx-page"><Header /><main className="container rc-loading">Loading research workspace…</main></div>;
  if (!project) return <div className="hx-page"><Header /><main className="container rc-loading">{error || "Research workspace not found."}</main></div>;

  const ready = project.researchStatus === "ready" || project.researchStatus === "error";
  const conversationMode = project.researchStatus === "conversation";
  const liveResearch = RESEARCH_STAGES.has(project.researchStatus);
  const sourceCount = Array.isArray(project.research?.sources) ? project.research.sources.length : 0;
  const evidenceCount = Number(project.research?.research_metrics?.evidence_passages ?? project.research?.evidence_passages ?? 0);
  const liveEvents = Array.isArray(activity?.activity) ? activity.activity.slice(-6).reverse() : [];
  const liveSources = Array.isArray(activity?.discoveredSources) ? activity.discoveredSources : [];
  const thinking = Boolean(sending || activity?.conversationThinking || buildingBrief);

  return (
    <div className="hx-page rc-page">
      <Header right={<button type="button" className="btn btn-ghost" disabled={!project.research} onClick={() => navigate(`/research/${id}`)}>Open research report</button>} />
      <main className="container rc-shell">
        <div className="rc-heading">
          <div>
            <p className="eyebrow">Research with Helix</p>
            <h1>{project.title}</h1>
            <p>{conversationMode ? "Explore the question with Helix first. When the direction feels right, build the evidence-backed research brief from the conversation." : "Keep refining the topic through evidence-backed conversation. Helix grounds follow-up answers in the persisted research corpus."}</p>
          </div>
          <span className={`rc-status rc-status--${project.researchStatus}`}><span className="rc-status__dot" aria-hidden="true" />{statusLabel(project.researchStatus)}</span>
        </div>

        <div className="rc-workspace">
          <section className="rc-chat" aria-label="Research conversation">
            <div ref={messagesRef} className="rc-chat__messages" onScroll={handleMessagesScroll}>
              {messages.length === 0 && <div className="rc-welcome"><span className="eyebrow">Start here</span><h2>What do you want to understand?</h2><p>Ask questions, test angles, and clarify what you want the final research brief to investigate.</p></div>}
              {messages.map((message, index) => {
                const isPending = Boolean(message.researchPending);
                return <article className={`rc-message rc-message--${message.role}${isPending ? " rc-message--pending" : ""}${message.stopped ? " rc-message--stopped" : ""}`} key={message.id || `${message.role}-${index}`}>
                  <span className="rc-message__role">{message.role === "user" ? "You" : "Helix"}</span>
                  <div className="rc-message__body">{message.role === "user" ? <div className="rc-plain-text">{String(message.content || "")}</div> : <MarkdownContent content={message.content} />}</div>
                  {isPending && activeMessageId === message.id && thinking && <div className="rc-message__live"><span className="rc-spinner" aria-hidden="true" /><span>{buildingBrief ? "Research pipeline active" : "Thinking"}</span><span className="rc-message__live-status">{buildingBrief ? statusLabel(activity?.status || project.researchStatus) : `${thinkingElapsed}s`}</span></div>}
                  {message.stopped && stoppedRequest?.messageId === message.id && <div className="rc-message__retry"><span>Helix did not finish this request.</span><button type="button" className="btn btn-ghost" onClick={retryStoppedRequest}>Retry</button></div>}
                  {message.conversationOnly && <span className="rc-message__meta">Exploration guidance · not verified research</span>}
                  {message.researchBrief && <span className="rc-message__meta">Deep research brief · source grounded</span>}
                  {message.sources?.length > 0 && <div className="rc-message__sources"><strong>{message.sources.length} sources</strong>{message.sources.slice(0, 3).map((source, sourceIndex) => <a key={`${source.url}-${sourceIndex}`} href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}</a>)}</div>}
                  {message.evidence?.length > 0 && <span className="rc-message__evidence">{message.evidence.length} evidence passages · corpus grounded</span>}
                </article>;
              })}

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
            </div>

            {!ready && project.researchStatus === "error" && <div className="rc-researching rc-researching--error" role="alert"><span>{activity?.detail || project.researchStageDetail || "Research needs attention."}</span></div>}
            {error && <p className="rc-error" role="alert">{error}</p>}
            <form className="rc-composer" onSubmit={(event) => { event.preventDefault(); if (thinking) void stopGeneration(); else void submitQuestion(question); }}>
              <textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={handleComposerKeyDown} disabled={(!conversationMode && !ready) || thinking} placeholder={conversationMode ? "Ask Helix about the direction you want to research…" : ready ? "Ask another research question…" : "Helix is building the research brief…"} maxLength={2000} rows={3} aria-label="Research question" />
              <div className="rc-composer__footer">
                <span>{conversationMode ? "Enter to send · Shift+Enter for a new line · exploration chat is not verified evidence." : ready ? "Enter to send · Shift+Enter for a new line · answers use the persisted research corpus." : "Research activity stays inside this conversation. You do not need to follow the page scroll."}</span>
                <button className="btn btn-cream" type="button" onClick={thinking ? stopGeneration : () => void submitQuestion(question)} disabled={!thinking && ((!conversationMode && !ready) || !question.trim())}>{thinking ? "Stop" : "Ask Helix"}</button>
              </div>
            </form>
          </section>

          <aside className="rc-brief" aria-label="Research brief">
            <div className="rc-brief__head"><div><span className="eyebrow">Working brief</span><h2>Research memory</h2></div><span className="rc-brief__dot" aria-label="Research memory" /></div>
            <p className="rc-brief__topic">{project.title}</p>
            <div className="rc-metrics"><div><strong>{sourceCount || "—"}</strong><span>sources</span></div><div><strong>{evidenceCount || "—"}</strong><span>evidence</span></div><div><strong>{conversationMode ? "Explore" : ready ? "Ready" : "…"}</strong><span>status</span></div></div>
            <div className="rc-brief__note"><strong>{conversationMode ? "Conversation first" : "How this works"}</strong><p>{conversationMode ? "Use this space to clarify the angle, scope, audience, and questions. Nothing from this exploratory chat is presented as verified evidence. The next step scans the conversation and runs the full research pipeline." : "Your conversation adds research direction. Helix does not treat chat text as verified fact; answers are grounded in the persisted source/evidence corpus."}</p></div>
            {conversationMode && <button type="button" className="btn btn-cream rc-continue" disabled={buildingBrief || thinking} onClick={buildBrief}>{buildingBrief ? "Building research brief…" : "Build research brief →"}</button>}
            {ready && <button type="button" className="btn btn-cream rc-continue" onClick={() => navigate(`/storyboard/${id}?stage=setup`)}>Continue to setup →</button>}
            {!conversationMode && !ready && <button type="button" className="btn btn-cream rc-continue" disabled>{buildingBrief ? "Building research brief…" : "Research in progress…"}</button>}
            <button type="button" className="btn btn-ghost rc-secondary" onClick={() => navigate("/")}>Back to Signals</button>
          </aside>
        </div>
      </main>
    </div>
  );
}
