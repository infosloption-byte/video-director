import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useSearchParams } from "react-router-dom";
import AdvancedEditorPage from "../pages/AdvancedEditorPage";
import EditorToolPanel from "./EditorToolPanel";
import "./EditorWorkspace.css";
import "./EditorToolsUX.css";

const TOOLS = [
  { id: "media", label: "Media", icon: "▧" },
  { id: "ai", label: "AI", icon: "✦" },
  { id: "render", label: "Render", icon: "▶" },
  { id: "productivity", label: "Productivity", icon: "⚡" },
];

export default function EditorWorkspace() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const [tool, setTool] = useState(params.get("tool") || "");
  const [expanded, setExpanded] = useState(false);
  const [topGrid, setTopGrid] = useState(null);

  useEffect(() => {
    const requested = params.get("tool") || "";
    if (requested !== tool) setTool(requested);
  }, [params, tool]);

  useEffect(() => {
    if (tool) setExpanded(true);
  }, [tool]);

  useEffect(() => {
    const syncTopGrid = () => {
      const next = document.querySelector(".advanced-editor__topgrid");
      setTopGrid((current) => current === next ? current : next);
    };

    syncTopGrid();
    const observer = new MutationObserver(syncTopGrid);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

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

  const toolsPanel = (
    <aside className="editor-tools-column" aria-label="Editor tools">
      <div className="editor-tools-column__bar">
        <div className="editor-tools-column__title">TOOLS</div>
        <button
          type="button"
          className="editor-tools-column__toggle"
          onClick={() => setExpanded((value) => !value)}
          aria-label={expanded ? "Collapse editor tools" : "Expand editor tools"}
          aria-expanded={expanded}
        >
          {expanded ? "‹" : "›"}
        </button>
      </div>

      <div className="editor-tools-column__items">
        {TOOLS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`editor-tool-button ${tool === item.id ? "is-active" : ""}`}
            onClick={() => openTool(item.id)}
            aria-label={item.label}
            aria-pressed={tool === item.id}
          >
            <span className="editor-tool-button__icon">{item.icon}</span>
            <span className="editor-tool-button__label">{item.label}</span>
          </button>
        ))}
      </div>

      {tool && (
        <EditorToolPanel
          tool={tool}
          id={id}
          selectedClip={{ trackId: "video", clipId: "" }}
          onReplaceMedia={reloadEditor}
          onApplied={reloadEditor}
          onClose={closeTool}
        />
      )}
    </aside>
  );

  return (
    <div className={`editor-workspace ${expanded ? "is-expanded" : "is-collapsed"} ${tool ? "has-tool-panel" : ""}`}>
      <AdvancedEditorPage />
      {topGrid ? createPortal(toolsPanel, topGrid) : null}
    </div>
  );
}
