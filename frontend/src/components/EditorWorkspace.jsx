import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import AdvancedEditorPage from "../pages/AdvancedEditorPage";
import EditorToolPanel from "./EditorToolPanel";
import "./EditorWorkspace.css";

const TOOLS = [
  { id: "media", label: "Media Library", icon: "▧" },
  { id: "ai", label: "AI Assistance", icon: "✦" },
  { id: "render", label: "Render Video", icon: "▶" },
  { id: "productivity", label: "Productivity", icon: "⚡" },
];

export default function EditorWorkspace() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const [tool, setTool] = useState(params.get("tool") || "");

  useEffect(() => {
    const requested = params.get("tool") || "";
    if (requested !== tool) setTool(requested);
  }, [params, tool]);

  function openTool(next) {
    const value = next === tool ? "" : next;
    setTool(value);
    const nextParams = new URLSearchParams(params);
    if (value) nextParams.set("tool", value); else nextParams.delete("tool");
    setParams(nextParams, { replace: true });
  }

  function closeTool() {
    setTool("");
    const nextParams = new URLSearchParams(params);
    nextParams.delete("tool");
    setParams(nextParams, { replace: true });
  }

  function reloadEditor() { window.location.reload(); }

  return <div className={`editor-workspace ${tool ? "has-tool-panel" : ""}`}>
    <AdvancedEditorPage />
    <nav className="editor-tool-rail" aria-label="Editor tools">
      <div className="editor-tool-rail__label">TOOLS</div>
      {TOOLS.map((item) => <button key={item.id} type="button" className={`editor-tool-rail__button ${tool === item.id ? "is-active" : ""}`} onClick={() => openTool(item.id)} aria-label={item.label} aria-pressed={tool === item.id}>
        <span>{item.icon}</span><small>{item.label}</small>
      </button>)}
    </nav>
    {tool && <EditorToolPanel tool={tool} id={id} selectedClip={null} onReplaceMedia={reloadEditor} onApplied={reloadEditor} onClose={closeTool} />}
  </div>;
}
