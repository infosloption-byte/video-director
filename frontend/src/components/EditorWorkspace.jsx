import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useSearchParams } from "react-router-dom";
import AdvancedEditorPage from "../pages/AdvancedEditorPage";
import EditorToolPanel from "./EditorToolPanel";
import EditorRenderModal from "./EditorRenderModal";
import "./EditorWorkspace.css";
import "./EditorToolsUX.css";
import "./EditorWorkspaceRefinement.css";
import "./EditorToolsUploadFix.css";

const TOOLS = [
  { id: "media", label: "Media", icon: "▧", description: "Import, search and organize project assets." },
  { id: "ai", label: "AI Assistance", icon: "✦", description: "Suggest safe, reversible editing changes." },
  { id: "productivity", label: "Productivity", icon: "⚡", description: "Versions, templates, activity and review tools." },
];

export default function EditorWorkspace() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const requestedTool = params.get("tool");
  const [tool, setTool] = useState(TOOLS.some((item) => item.id === requestedTool) ? requestedTool : "");
  const [expanded, setExpanded] = useState(true);
  const [topGrid, setTopGrid] = useState(null);
  const [actions, setActions] = useState(null);
  const [showRender, setShowRender] = useState(false);

  useEffect(() => {
    const requested = params.get("tool");
    if (requested === "render") {
      const next = new URLSearchParams(params);
      next.delete("tool");
      setParams(next, { replace: true });
      setTool("");
      return;
    }
    setTool(TOOLS.some((item) => item.id === requested) ? requested : "");
  }, [params, setParams]);

  useEffect(() => { if (tool) setExpanded(true); }, [tool]);

  useEffect(() => {
    const sync = () => {
      const nextGrid = document.querySelector(".advanced-editor__topgrid");
      const nextActions = document.querySelector(".advanced-editor__actions");
      setTopGrid((current) => current === nextGrid ? current : nextGrid);
      setActions((current) => current === nextActions ? current : nextActions);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!actions) return undefined;
    const renderLink = actions.querySelector('a[href*="/render"]');
    if (renderLink) renderLink.style.display = "none";
    const aiLink = actions.querySelector('a[href*="/ai"]');
    if (aiLink) aiLink.style.display = "none";
    return () => {
      if (renderLink) renderLink.style.display = "";
      if (aiLink) aiLink.style.display = "";
    };
  }, [actions]);

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

  const toolsPanel = <aside className="editor-tools-column" aria-label="Editor tools">
    <div className="editor-tools-column__bar"><div className="editor-tools-column__title">TOOLS</div><button type="button" className="editor-tools-column__toggle" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "Collapse editor tools" : "Expand editor tools"} aria-expanded={expanded}>{expanded ? "‹" : "›"}</button></div>
    <div className="editor-tools-accordion">
      {TOOLS.map((item) => {
        const open = tool === item.id;
        return <section key={item.id} className={`editor-tool-accordion ${open ? "is-open" : ""}`}>
          <button type="button" className="editor-tool-accordion__trigger" onClick={() => openTool(item.id)} aria-expanded={open}>
            <span className="editor-tool-accordion__icon">{item.icon}</span>
            <span className="editor-tool-accordion__copy"><strong>{item.label}</strong><small>{item.description}</small></span>
            <span className="editor-tool-accordion__chevron">{open ? "−" : "+"}</span>
          </button>
          {open && <EditorToolPanel tool={item.id} id={id} selectedClip={{ trackId: "video", clipId: "" }} onReplaceMedia={reloadEditor} onApplied={reloadEditor} onClose={closeTool} />}
        </section>;
      })}
    </div>
  </aside>;

  return <div className={`editor-workspace ${expanded ? "is-expanded" : "is-collapsed"} ${tool ? "has-tool-panel" : ""}`}>
    <AdvancedEditorPage />
    {topGrid ? createPortal(toolsPanel, topGrid) : null}
    {actions ? createPortal(<button type="button" className="editor-render-launch btn btn-ghost" onClick={() => setShowRender(true)} aria-label="Open render dialog">Render MP4</button>, actions) : null}
    {showRender ? createPortal(<EditorRenderModal id={id} onClose={() => setShowRender(false)} />, document.body) : null}
  </div>;
}
