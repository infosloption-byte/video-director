import { useEffect, useMemo, useState } from "react";
import { IconArrowLeft, IconArrowRight } from "./Icons";
import "./FinalizePanel.css";

const RENDER_STAGES = [
  { id: "queued", label: "Queued", detail: "Waiting for the render worker to start." },
  { id: "preflight", label: "Preflight", detail: "Validating narration, duration, and render settings." },
  { id: "assets", label: "Preparing B-roll", detail: "Downloading and caching the selected visuals locally." },
  { id: "bundle", label: "Building composition", detail: "Bundling the Helix Remotion composition." },
  { id: "composition", label: "Preparing timeline", detail: "Loading the 9:16 composition and scene timeline." },
  { id: "rendering", label: "Rendering video", detail: "Encoding video frames, audio, and synchronized captions." },
  { id: "finalizing", label: "Finalizing", detail: "Writing the MP4 and saving the completed render." },
  { id: "complete", label: "Complete", detail: "Your final MP4 is ready." },
];

function formatSeconds(value) {
  return `${Number(value || 0).toFixed(1)}s`;
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function stageIndex(stage) {
  const index = RENDER_STAGES.findIndex((item) => item.id === stage);
  return index >= 0 ? index : 0;
}

function StageSubsteps({ substeps = [], failed = false }) {
  if (!substeps.length) return null;
  return (
    <div className="finalize-panel__substeps">
      {substeps.map((substep) => {
        const progress = Math.max(0, Math.min(100, Number(substep.progress || 0)));
        const done = progress >= 100;
        return (
          <div key={substep.id} className={`finalize-panel__substep ${done ? "is-done" : ""} ${failed ? "is-failed" : ""}`}>
            <div className="finalize-panel__substep-head">
              <span>{done ? "✓" : "•"}</span>
              <strong>{substep.label}</strong>
              <em>{progress}%</em>
            </div>
            <div className="finalize-panel__substep-track"><span style={{ width: `${progress}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function AssetDownloadDetail({ asset }) {
  if (!asset) return null;
  const progress = asset.progress == null ? null : Math.max(0, Math.min(100, Number(asset.progress)));
  const current = progress == null ? asset.phase === "cached" || asset.phase === "downloaded" ? 100 : 0 : progress;
  const bytes = formatBytes(asset.receivedBytes);
  const total = formatBytes(asset.totalBytes);
  return (
    <div className="finalize-panel__asset-detail">
      <div className="finalize-panel__asset-head">
        <div>
          <span className="mono-label">CURRENT B-ROLL</span>
          <strong>{asset.label}</strong>
        </div>
        <span>{current}%</span>
      </div>
      <div className="finalize-panel__asset-track"><span style={{ width: `${current}%` }} /></div>
      <div className="finalize-panel__asset-meta">
        <span>{asset.phase === "cached" ? "Already cached" : asset.phase === "downloaded" ? "Download complete" : "Downloading video"}</span>
        {bytes && <span>{total ? `${bytes} / ${total}` : bytes}</span>}
      </div>
    </div>
  );
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
  const [liveRenderStatus, setLiveRenderStatus] = useState(null);

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

  async function loadRenderStatus() {
    try {
      const response = await fetch(`/api/projects/${projectId}/render-status`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return;
      setLiveRenderStatus(data);
    } catch {
      // Keep the last known render state during transient API/proxy interruptions.
    }
  }

  useEffect(() => {
    void loadExports();
    void loadNarrationStatus();
    void loadRenderStatus();
  }, [projectId, scenes.length]);

  useEffect(() => {
    if (renderStatus) setLiveRenderStatus(renderStatus);
  }, [renderStatus]);

  const effectiveRenderStatus = liveRenderStatus || renderStatus;
  const renderState = effectiveRenderStatus?.status || "idle";
  const isRenderActive = ["queued", "waiting", "active", "delayed", "prioritized"].includes(renderState);

  useEffect(() => {
    if (!isRenderActive) return undefined;
    let cancelled = false;
    let timer = null;

    const poll = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/render-status`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) setLiveRenderStatus(data);
      } catch {
        // Retry without changing the visible active state.
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, 1200);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [projectId, isRenderActive]);

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
  const renderUrl = effectiveRenderStatus?.renderUrl || project?.renderUrl || exports?.mp4Url || null;
  const renderComplete = Boolean(renderUrl) && (renderState === "completed" || renderState === "complete" || (!effectiveRenderStatus && !renderLoading));
  const currentStage = renderComplete ? "complete" : (effectiveRenderStatus?.stage || (renderState === "idle" ? "preflight" : "queued"));
  const currentIndex = stageIndex(currentStage);
  const progress = Math.max(0, Math.min(100, Number(effectiveRenderStatus?.progress || 0)));
  const stageProgress = Math.max(0, Math.min(100, Number(effectiveRenderStatus?.stageProgress || 0)));
  const stageMessage = effectiveRenderStatus?.message || RENDER_STAGES[currentIndex]?.detail || "Preparing render…";
  const renderFailed = renderState === "failed";

  const displayDuration = useMemo(() => {
    const value = Number(project?.durationSeconds || scriptedTime || 0);
    const selectedTarget = Number(project?.setup?.length || project?.scriptLengthSeconds || 0);
    if (selectedTarget > 0 && value > selectedTarget) return selectedTarget;
    return value;
  }, [project?.durationSeconds, project?.scriptLengthSeconds, project?.setup?.length, scriptedTime]);

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
          {renderComplete ? "MP4 ready" : renderFailed ? "Render failed" : isRenderActive ? `${progress}% in progress` : "Preflight"}
        </div>
      </div>

      <div className="finalize-panel__summary">
        <div><span className="mono-label">RUNTIME</span><strong>{formatSeconds(displayDuration)}</strong></div>
        <div><span className="mono-label">CUTS</span><strong>{scenes.length}</strong></div>
        <div><span className="mono-label">FRAMEWORK</span><strong>{project?.setup?.framework || "—"}</strong></div>
        <div><span className="mono-label">NARRATION</span><strong>{narrationReady ? "Ready" : "Missing"}</strong></div>
      </div>

      {!narrationReady && <div className="finalize-panel__warning">Narration is not complete for every scene. Generate narration in Storyboard before rendering the final MP4.</div>}
      {renderError && <div className="finalize-panel__error"><strong>Render couldn't complete.</strong><span>{renderError}</span></div>}
      {exportError && <div className="finalize-panel__error"><strong>Export couldn't complete.</strong><span>{exportError}</span></div>}
      {facebookError && <div className="finalize-panel__error"><strong>Facebook publish couldn't complete.</strong><span>{facebookError}</span></div>}
      {facebookResult && <div className="finalize-panel__success"><strong>Published to Facebook.</strong><span>Reel video ID: {facebookResult.videoId}</span></div>}

      <div className="finalize-panel__render">
        <div className="finalize-panel__render-copy">
          <p className="mono-label">FINAL VIDEO</p>
          <h3>{renderComplete ? "Your MP4 is ready." : renderFailed ? "Render stopped." : "Render the finished reel."}</h3>
          <p>{isRenderActive ? stageMessage : "Remotion combines the selected B-roll, narration and synced captions into the final 9:16 video."}</p>
        </div>
        {!renderComplete && !renderFailed && <button className="btn btn-cream" onClick={onRender} disabled={renderLoading || isRenderActive || !narrationReady}>{renderLoading || isRenderActive ? `${progress}% · ${RENDER_STAGES[currentIndex]?.label || "Rendering"}` : "Render MP4 →"}</button>}
        {renderComplete && <a className="btn btn-cream" href={renderUrl} target="_blank" rel="noreferrer">Open MP4 <IconArrowRight className="btn-icon" /></a>}
        {renderFailed && <button className="btn btn-cream" onClick={onRender} disabled={renderLoading || !narrationReady}>{renderLoading ? "Retrying…" : "Retry render →"}</button>}
      </div>

      {(isRenderActive || renderFailed || renderComplete) && (
        <div className="finalize-panel__progress" aria-live="polite">
          <div className="finalize-panel__progress-head">
            <div><span className="mono-label">RENDER PIPELINE</span><strong>{progress}% complete</strong></div>
            <span className="finalize-panel__progress-stage">{RENDER_STAGES[currentIndex]?.label}</span>
          </div>
          <div className="finalize-panel__progress-track"><span style={{ width: `${progress}%` }} /></div>
          {currentStage === "assets" && <AssetDownloadDetail asset={effectiveRenderStatus?.asset} />}
          <div className="finalize-panel__stage-list">
            {RENDER_STAGES.map((stage, index) => {
              const done = renderComplete || index < currentIndex;
              const active = !renderComplete && !renderFailed && index === currentIndex;
              const failed = renderFailed && index === currentIndex;
              return (
                <div key={stage.id} className={`finalize-panel__stage ${done ? "is-done" : ""} ${active ? "is-active" : ""} ${failed ? "is-failed" : ""}`}>
                  <span className="finalize-panel__stage-mark">{done ? "✓" : failed ? "!" : String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{stage.label}</strong>
                    <small>{active ? `${stageMessage}${stageProgress ? ` · ${stageProgress}%` : ""}` : stage.detail}</small>
                    {active && <StageSubsteps substeps={effectiveRenderStatus?.substeps} failed={failed} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="finalize-panel__exports">
        <div className="finalize-panel__exports-head"><div><p className="mono-label">EXPORT PACK</p><h3>Captions, script, and SEO copy</h3></div><button className="btn btn-ghost" onClick={buildExports} disabled={exportLoading}>{exportLoading ? "Preparing…" : "Prepare exports"}</button></div>
        <div className="finalize-panel__cards">
          <a className={`finalize-panel__card ${exports?.srtUrl ? "is-ready" : ""}`} href={exports?.srtUrl || "#"} onClick={(event) => { if (!exports?.srtUrl) event.preventDefault(); }} download><span className="mono-label">SRT</span><strong>Captions</strong><small>{exports?.srtUrl ? "Download .srt" : "Prepare exports first"}</small></a>
          <a className={`finalize-panel__card ${exports?.scriptTxtUrl ? "is-ready" : ""}`} href={exports?.scriptTxtUrl || "#"} onClick={(event) => { if (!exports?.scriptTxtUrl) event.preventDefault(); }} download><span className="mono-label">TXT</span><strong>Script</strong><small>{exports?.scriptTxtUrl ? "Download plain text" : "Prepare exports first"}</small></a>
          <div className="finalize-panel__card finalize-panel__card--copy"><span className="mono-label">SEO</span><strong>Caption</strong><small>{exports?.seoCaption || "Prepare exports first"}</small><button className="btn btn-ghost" onClick={copySeoCaption} disabled={!exports?.seoCaption}>{copied ? "Copied" : "Copy caption"}</button></div>
        </div>
      </div>

      <div className="finalize-panel__exports">
        <div className="finalize-panel__exports-head"><div><p className="mono-label">FACEBOOK</p><h3>Publish this Reel to your Page</h3><p>Available only after a completed MP4 render. The server requires a Page ID and Page access token.</p></div><button className="btn btn-cream" onClick={publishToFacebook} disabled={!renderComplete || facebookPublishing || renderLoading || exportLoading}>{facebookPublishing ? "Publishing…" : facebookResult ? "Published" : "Publish to Facebook →"}</button></div>
      </div>

      <div className="finalize-panel__actions"><button className="btn btn-ghost" onClick={onBack} disabled={renderLoading || isRenderActive || exportLoading || facebookPublishing}><IconArrowLeft className="btn-icon" /> Back to storyboard</button></div>
    </section>
  );
}
