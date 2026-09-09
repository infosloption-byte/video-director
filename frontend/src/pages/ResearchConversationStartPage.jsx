import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import "./ResearchConversationPage.css";

export default function ResearchConversationStartPage() {
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  async function start(event) {
    event.preventDefault();
    const value = topic.trim();
    if (value.length < 3 || starting) return;
    setStarting(true); setError("");
    try {
      const res = await fetch("/api/research-conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: value }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to start research.");
      navigate(`/research-conversation/${data.project.id}`);
    } catch (err) { setError(err.message); setStarting(false); }
  }

  return (
    <div className="hx-page rc-page">
      <Header />
      <main className="container rc-start">
        <div className="rc-start__intro">
          <p className="eyebrow">Research with Helix</p>
          <h1>Start with your own question.</h1>
          <p>Tell Helix what you want to investigate. It will search, read, compare, and verify sources using the same deep-research mechanism that powers the normal Research flow.</p>
        </div>
        <form className="rc-start__form" onSubmit={start}>
          <label htmlFor="research-topic">What do you want to investigate?</label>
          <textarea id="research-topic" value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={255} rows={4} placeholder="e.g. How is AI changing drug discovery?" autoFocus />
          <div className="rc-start__footer"><span>Start broad. You can ask focused follow-up questions once the first evidence pass is complete.</span><button type="submit" className="btn btn-cream" disabled={starting || topic.trim().length < 3}>{starting ? "Starting research…" : "Start research conversation →"}</button></div>
          {error && <p className="rc-error" role="alert">{error}</p>}
        </form>
      </main>
    </div>
  );
}
