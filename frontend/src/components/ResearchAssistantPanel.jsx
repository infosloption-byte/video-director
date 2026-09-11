import { useState } from "react";
import "./ResearchAssistantPanelFormatting.css";

function renderInline(text) {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s]+)/g;
  return String(text || "").split(pattern).map((part, index) => {
    if (!part) return null;
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(part)) return <code key={index}>{part.slice(1, -1)}</code>;
    if (/^https?:\/\//.test(part)) return <a key={index} href={part} target="_blank" rel="noreferrer">{part.replace(/^https?:\/\//, "")}</a>;
    return <span key={index}>{part}</span>;
  });
}

function formatAnswer(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let paragraph = [];
  let list = [];
  let listType = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(<p className="research-assistant__formatted-paragraph" key={`p-${blocks.length}`}>{renderInline(paragraph.join(" "))}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    const Tag = listType === "ordered" ? "ol" : "ul";
    blocks.push(<Tag className="research-assistant__formatted-list" key={`list-${blocks.length}`}>{list.map((item, index) => <li key={index}>{renderInline(item)}</li>)}</Tag>);
    list = [];
    listType = null;
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      return;
    }
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(<h4 className="research-assistant__formatted-heading" key={`h-${blocks.length}`}>{renderInline(heading[1])}</h4>);
      return;
    }
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    const unordered = line.match(/^(?:[-•*])\s+(.+)$/);
    if (ordered || unordered) {
      flushParagraph();
      const nextType = ordered ? "ordered" : "unordered";
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      list.push((ordered || unordered)[1]);
      return;
    }
    flushList();
    if (/^[A-Z][^.!?]{0,60}:$/.test(line)) {
      flushParagraph();
      blocks.push(<h4 className="research-assistant__formatted-heading" key={`label-${blocks.length}`}>{renderInline(line.slice(0, -1))}</h4>);
      return;
    }
    paragraph.push(line);
  });

  flushParagraph();
  flushList();
  return <div className="research-assistant__formatted-answer">{blocks}</div>;
}

export default function ResearchAssistantPanel({ projectId }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ask(event) {
    event.preventDefault();
    const value = question.trim();
    if (!value || busy) return;
    setQuestion("");
    setError("");
    setMessages((items) => [...items, { role: "user", text: value }]);
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/research/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: value })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Research assistant failed.");
      setMessages((items) => [...items, { role: "assistant", text: data.answer, grounded: data.grounded, searchUsed: data.searchUsed, evidence: data.evidence || [], sources: data.sources || [] }]);
    } catch (err) {
      setError(err.message || "Research assistant failed.");
    } finally {
      setBusy(false);
    }
  }

  return <aside className="research-assistant" aria-labelledby="research-assistant-title">
    <div className="research-assistant__head">
      <div>
        <p className="eyebrow">Research assistant</p>
        <h2 id="research-assistant-title">Ask Helix</h2>
      </div>
      <span className="research-assistant__status">Research corpus</span>
    </div>
    <p className="research-assistant__intro">Ask about this completed research. Helix answers from the stored research corpus first and clearly says when that corpus does not establish an answer.</p>

    <div className="research-assistant__messages" aria-live="polite">
      {messages.length === 0 && <div className="research-assistant__empty"><strong>Continue the research</strong><span>Examples: “What evidence is strongest?”, “What is still uncertain?”, or “What changed recently?”</span></div>}
      {messages.map((message, index) => <article key={`${message.role}-${index}`} className={`research-assistant__message research-assistant__message--${message.role}`}>
        <div className="research-assistant__message-topline">
          <span className="research-assistant__message-role">{message.role === "user" ? "You" : "Helix · research corpus"}</span>
          {message.role === "assistant" && <span className={`research-assistant__grounding ${message.grounded ? "is-grounded" : "is-unverified"}`}>{message.grounded ? "Source-grounded" : "Not established"}</span>}
        </div>
        {message.role === "assistant" ? formatAnswer(message.text) : <p className="research-assistant__user-text">{message.text}</p>}
        {message.evidence?.length > 0 && <div className="research-assistant__evidence"><strong>Supporting evidence</strong>{message.evidence.map((item) => <blockquote key={item.id}>{item.passageText}<small>{item.locator || `Evidence ${Number(item.evidenceIndex) + 1}`}</small></blockquote>)}</div>}
        {message.sources?.length > 0 && <div className="research-assistant__sources"><strong>Sources</strong>{message.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}</a>)}</div>}
      </article>)}
      {busy && <div className="research-assistant__typing" role="status">Helix is checking the research…</div>}
    </div>

    {error && <p className="research-assistant__error" role="alert">{error}</p>}
    <form className="research-assistant__form" onSubmit={ask}>
      <textarea autoFocus aria-label="Ask Helix about this research" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question about this research…" rows={3} disabled={busy} />
      <div className="research-assistant__form-footer"><span>Stored research corpus · no new search</span><button className="btn btn-cream" type="submit" disabled={busy || !question.trim()}>{busy ? "Thinking…" : "Ask Helix"}</button></div>
    </form>
  </aside>;
}
