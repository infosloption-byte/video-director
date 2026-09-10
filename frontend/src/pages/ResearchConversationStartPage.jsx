import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { useProjects } from "../context/useProjects.js";
import "./ResearchConversationPage.css";

export default function ResearchConversationStartPage() {
  const navigate = useNavigate();
  const { addProject } = useProjects();
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
      if (!res.ok) throw new Error(data.error || "Failed to start research conversation.");
      addProject(data.project);
      navigate(`/research-conversation/${data.project.id}`);
    } catch (err) { setError(err.message); setStarting(false); }
  }

  return (
    <div className="hx-page rc-page">
      <Header />
      <main className="container rc-start">
        <div className="rc-start__intro">
          <p className="eyebrow">Research with Helix</p>
          <h1>Start with a conversation.</h1>
          <p>Explore what you want to investigate with Helix first. When the direction is clear, build the full evidence-backed research brief from the conversation and carry that research memory into Setup and Storyboard.</p>
        </div>
        <form className="rc-start__form" onSubmit={start}>
          <label htmlFor="research-topic">What do you want to investigate?</label>
          <textarea id="research-topic" value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={255} rows={4} placeholder="e.g. How is AI changing drug discovery?" autoFocus />
          <div className="rc-start__footer"><span>Start broad. Ask questions, refine the angle, then choose when you are ready to build the evidence-backed brief.</span><button type="submit" className="btn btn-cream" disabled={starting || topic.trim().length < 3}>{starting ? "Opening conversation…" : "Start conversation →"}</button></div>
          {error && <p className="rc-error" role="alert">{error}</p>}
        </form>
      </main>
    </div>
  );
}
