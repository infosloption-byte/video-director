import { useEffect, useState } from "react";
import { IconArrowLeft, IconArrowRight } from "./Icons";
import "./FinalizePanel.css";

function formatSeconds(value) {
  return `${Number(value || 0).toFixed(1)}s`;
}

export default function FinalizePanel({ projectId, project, scenes, renderStatus, renderLoading, renderError, onRender, onBack }) {
  const [exports, setExports] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState("");
  const [copied, setCopied] = useState(false);
  const [narrationReady, setNarrationReady] = useState(false);
  const [facebookPublishing, setFacebookPublishing] = useState(false);
  const [facebookResult, setFacebookResult] = useState(null);
  const [facebookError, setFacebookError] = useState("");

  async function loadExports() {
    try {
      const response = await fetch(`/api/projects/${projectId}/export-status`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to load exports.");
      setExports(data);
    } catch (error) {
      setExportError(error.message || "Failed to load exports.");
    }
  }

  async function loadNarrationStatus() {
    try {
      const response = await fetch(`/api/projects/${projectId}/narration-status`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to check narration.");
      setNarrationReady(Boolean(data.ready));
    } catch {
      setNarrationReady(scenes.length > 0 && scenes.every((scene) => Boolean(scene.audioUrl && scene.wordTimestamps?.length)));
    }
  }

  useEffect(() => {
    void loadExports();
    void loadNarrationStatus();
  }, [projectId, renderStatus?.status, renderStatus?.renderUrl, scenes.length]);

  async function buildExports() {
    setExportLoading(true);
    setExportError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/export`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to build exports.");
      setExports(data);
    } catch (error) {
      setExportError(error.message || "Failed to build exports.");
    } finally {
      setExportLoading(false);
    }
  }

  async function copySeoCaption() {
    if (!exports?.seoCaption) return;
    try {
      await navigator.clipboard.writeText(exports.seoCaption);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setExportError("Clipboard access is unavailable in this browser.");
    }
  }

  async function publishToFacebook() {
    if (facebookPublishing || !renderComplete) return;
    setFacebookPublishing(true);
    setFacebookError("");
    setFacebookResult(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/publish-facebook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: project?.title || "Helix Reel",
          description: exports?.seoCaption || project?.seoCaption || project?.title || "",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Facebook publishing failed.");
      setFacebookResult(data);
    } catch (error) {
      setFacebookError(error.message || "Facebook publishing failed.");
    } finally {
      setFacebookPublishing(false);
    }
  }

  const scriptedTime = scenes.reduce((sum, scene) => sum + Number(scene.durationSeconds || 0), 0);
  const renderUrl = renderStatus?.renderUrl || project?.renderUrl || exports?.mp4Url || null;
  const renderComplete = Boolean(renderUrl) && (renderStatus?.status === "completed" || !renderStatus);

  return (
    <section className="finalize-panel">
      <div className="finalize-panel__intro">
        <div>
          <p className="eyebrow">Finalize &amp; export</p>
          <h2>Everything ready for the handoff.</h2>
          <p>Review the runtime, render the final MP4, and export captions or the script for repurposing.</p>
        </div>
        <div className="finalize-panel__status">
          <span className={`finalize-panel__status-dot ${renderComplete ? "is-ready" : ""}`} />
          {renderComplete ? "MP4 ready" : "Preflight"}
        </div>
      </div>

      <div className="finalize-panel__summary">
        <div><span className="mono-label">RUNTIME</span><strong>{formatSeconds(project?.durationSeconds || scriptedTime)}</strong></div>
        <div><span className="mono-label">CUTS</span><strong>{scenes.length}</strong></div>
        <div><span className="mono-label">FRAMEWORK</span><strong>{project?.setup?.framework || "—"}</strong></div>
        <div><span className="mono-label">NARRATION</span><strong>{narrationReady ? "Ready" : "Missing"}</strong></div>
      </div>

      {!narrationReady && (
        <div className="finalize-panel__warning">
          Narration is not complete for every scene. Generate narration in Storyboard before rendering the final MP4.
        </div>
      )}

      {renderError && <div className="finalize-panel__error"><strong>Render couldn't complete.</strong><span>{renderError}</span></div>}
      {exportError && <div className="finalize-panel__error"><strong>Export couldn't complete.</strong><span>{exportError}</span></div>}
      {facebookError && <div className="finalize-panel__error"><strong>Facebook publish couldn't complete.</strong><span>{facebookError}</span></div>}
      {facebookResult && <div className="finalize-panel__success"><strong>Published to Facebook.</strong><span>Reel video ID: {facebookResult.videoId}</span></div>}

      <div className="finalize-panel__render">
        <div>
          <p className="mono-label">FINAL VIDEO</p>
          <h3>{renderComplete ? "Your MP4 is ready." : "Render the finished reel."}</h3>
          <p>{renderStatus?.status === "active" ? `Rendering video… ${Number(renderStatus.progress || 0)}%` : "Remotion combines the selected B-roll, narration and synced captions into the final 9:16 video."}</p>
        </div>
        {renderComplete ? (
          <a className="btn btn-cream" href={renderUrl} target="_blank" rel="noreferrer">Open MP4 <IconArrowRight className="btn-icon" /></a>
        ) : (
          <button className="btn btn-cream" onClick={onRender} disabled={renderLoading || !narrationReady}>
            {renderLoading ? `Rendering ${Number(renderStatus?.progress || 0)}%…` : "Render MP4 →"}
          </button>
        )}
      </div>

      <div className="finalize-panel__exports">
        <div className="finalize-panel__exports-head">
          <div>
            <p className="mono-label">EXPORT PACK</p>
            <h3>Captions, script, and SEO copy</h3>
          </div>
          <button className="btn btn-ghost" onClick={buildExports} disabled={exportLoading}>{exportLoading ? "Preparing…" : "Prepare exports"}</button>
        </div>

        <div className="finalize-panel__cards">
          <a className={`finalize-panel__card ${exports?.srtUrl ? "is-ready" : ""}`} href={exports?.srtUrl || "#"} onClick={(event) => { if (!exports?.srtUrl) event.preventDefault(); }} download>
            <span className="mono-label">SRT</span><strong>Captions</strong><small>{exports?.srtUrl ? "Download .srt" : "Prepare exports first"}</small>
          </a>
          <a className={`finalize-panel__card ${exports?.scriptTxtUrl ? "is-ready" : ""}`} href={exports?.scriptTxtUrl || "#"} onClick={(event) => { if (!exports?.scriptTxtUrl) event.preventDefault(); }} download>
            <span className="mono-label">TXT</span><strong>Script</strong><small>{exports?.scriptTxtUrl ? "Download plain text" : "Prepare exports first"}</small>
          </a>
          <div className="finalize-panel__card finalize-panel__card--copy">
            <span className="mono-label">SEO</span><strong>Caption</strong><small>{exports?.seoCaption || "Prepare exports first"}</small>
            <button className="btn btn-ghost" onClick={copySeoCaption} disabled={!exports?.seoCaption}>{copied ? "Copied" : "Copy caption"}</button>
          </div>
        </div>
      </div>

      <div className="finalize-panel__exports">
        <div className="finalize-panel__exports-head">
          <div>
            <p className="mono-label">FACEBOOK</p>
            <h3>Publish this Reel to your Page</h3>
            <p>Available only after a completed MP4 render. The server requires a Page ID and Page access token.</p>
          </div>
          <button className="btn btn-cream" onClick={publishToFacebook} disabled={!renderComplete || facebookPublishing || renderLoading || exportLoading}>
            {facebookPublishing ? "Publishing…" : facebookResult ? "Published" : "Publish to Facebook →"}
          </button>
        </div>
      </div>

      <div className="finalize-panel__actions">
        <button className="btn btn-ghost" onClick={onBack} disabled={renderLoading || exportLoading || facebookPublishing}><IconArrowLeft className="btn-icon" /> Back to storyboard</button>
      </div>
    </section>
  );
}
