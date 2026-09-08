import { useState } from "react";

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

  return <aside className="research-assistant" aria-label="Research assistant">
    <div className="research-assistant__head">
      <div>
        <p className="eyebrow">Research assistant</p>
        <h2>Ask Helix</h2>
      </div>
      <span className="research-assistant__status">Research corpus</span>
    </div>
    <p className="research-assistant__intro">Ask about this completed research. Helix answers from the stored research corpus first and clearly says when that corpus does not establish an answer.</p>

    <div className="research-assistant__messages" aria-live="polite">
      {messages.length === 0 && <div className="research-assistant__empty"><strong>Continue the research</strong><span>Examples: “What evidence is strongest?”, “What is still uncertain?”, or “What changed recently?”</span></div>}
      {messages.map((message, index) => <article key={`${message.role}-${index}`} className={`research-assistant__message research-assistant__message--${message.role}`}>
        <span className="research-assistant__message-role">{message.role === "user" ? "You" : "Helix · research corpus"}</span>
        <p>{message.text}</p>
        {message.evidence?.length > 0 && <div className="research-assistant__evidence"><strong>Supporting evidence</strong>{message.evidence.map((item) => <blockquote key={item.id}>{item.passageText}<small>{item.locator || `Evidence ${Number(item.evidenceIndex) + 1}`}</small></blockquote>)}</div>}
        {message.sources?.length > 0 && <div className="research-assistant__sources"><strong>Web sources</strong>{message.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div>}
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
