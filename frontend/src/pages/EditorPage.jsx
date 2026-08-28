import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Header from "../components/Header";
import { useAuth } from "../context/AuthContext";
import "../components/ui.css";
import "./EditorPage.css";

const TRACK_ORDER = ["video", "narration", "captions", "overlays"];

function formatTime(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function cloneTimeline(timeline) {
  return JSON.parse(JSON.stringify(timeline));
}

function updateTrack(timeline, trackId, updater) {
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => track.id === trackId ? updater(track) : track),
  };
}

export default function EditorPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [project, setProject] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [version, setVersion] = useState(1);
  const [selectedClip, setSelectedClip] = useState({ trackId: "video", clipId: "" });
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef(null);

  const loadEditor = useCallback(async () => {
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${id}/editor`, { cache: "no-store", credentials: "include" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to load editor.");
      setProject(data.project);
      setTimeline(data.editor.timeline);
      setVersion(data.editor.version);
      const firstVideo = data.editor.timeline?.tracks?.find((track) => track.id === "video")?.clips?.[0];
      setSelectedClip({ trackId: "video", clipId: firstVideo?.id || "" });
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Failed to load editor.");
    }
  }, [id]);

  useEffect(() => {
    if (!user) return undefined;
    void loadEditor();
    return undefined;
  }, [loadEditor, user]);

  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
  }, []);

  const selected = useMemo(() => {
    if (!timeline || !selectedClip.clipId) return null;
    for (const track of timeline.tracks || []) {
      const clip = track.clips?.find((item) => item.id === selectedClip.clipId);
      if (clip) return { ...clip, trackId: track.id, trackName: track.name };
    }
    return null;
  }, [timeline, selectedClip]);

  const selectedVideo = useMemo(() => {
    if (!timeline) return null;
    const clip = timeline.tracks?.find((track) => track.id === "video")?.clips?.find((item) => item.id === selectedClip.clipId);
    return clip || timeline.tracks?.find((track) => track.id === "video")?.clips?.[0] || null;
  }, [timeline, selectedClip]);

  function mutate(mutator, select) {
    setTimeline((current) => {
      if (!current) return current;
      const next = mutator(cloneTimeline(current));
      return next;
    });
    if (select) setSelectedClip(select);
  }

  async function saveTimeline(nextTimeline = timeline) {
    if (!nextTimeline || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${id}/editor`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, timeline: nextTimeline }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to save editor changes.");
      setVersion(data.editor.version);
      setTimeline(data.editor.timeline);
      setMessage("Saved");
    } catch (error) {
      setMessage(error.message || "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (status !== "ready" || !timeline) return undefined;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveTimeline(timeline);
    }, 900);
    return undefined;
  }, [timeline, status]);

  function setClipValue(field, value) {
    if (!selected) return;
    mutate((current) => updateTrack(current, selected.trackId, (track) => ({
      ...track,
      clips: track.clips.map((clip) => clip.id === selected.id ? { ...clip, [field]: value } : clip),
    })));
  }

  function moveClip(delta) {
    if (!selected || selected.trackId !== "video") return;
    mutate((current) => updateTrack(current, selected.trackId, (track) => {
      const index = track.clips.findIndex((clip) => clip.id === selected.id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= track.clips.length) return track;
      const clips = [...track.clips];
      [clips[index], clips[target]] = [clips[target], clips[index]];
      return { ...track, clips };
    }));
  }

  function splitClip() {
    if (!selected) return;
    const splitAt = Number((selected.duration / 2).toFixed(3));
    if (splitAt < 0.1) return;
    mutate((current) => updateTrack(current, selected.trackId, (track) => {
      const next = [];
      for (const clip of track.clips) {
        if (clip.id !== selected.id) {
          next.push(clip);
          continue;
        }
        const first = { ...clip, id: `${clip.id}-a`, duration: splitAt };
        const second = { ...clip, id: `${clip.id}-b`, start: clip.start + splitAt, duration: Number((clip.duration - splitAt).toFixed(3)), offset: Number(clip.offset || 0) + splitAt };
        next.push(first, second);
      }
      return { ...track, clips: next };
    }), { trackId: selected.trackId, clipId: `${selected.id}-a` });
  }

  function deleteSelected() {
    if (!selected || selected.trackId === "narration") return;
    mutate((current) => updateTrack(current, selected.trackId, (track) => ({ ...track, clips: track.clips.filter((clip) => clip.id !== selected.id) })), { trackId: "video", clipId: "" });
  }

  function addOverlay() {
    if (!timeline) return;
    const idValue = `overlay-${Date.now()}`;
    mutate((current) => updateTrack(current, "overlays", (track) => ({
      ...track,
      clips: [...track.clips, { id: idValue, type: "overlay", start: 0, duration: 2, text: "New title", position: "center", style: "default" }],
    })), { trackId: "overlays", clipId: idValue });
  }

  if (!user) return null;
  if (status === "loading") return <div className="hx-page"><Header /><main className="container editor-page"><div className="editor-state">Loading your editor…</div></main></div>;
  if (status === "error") return <div className="hx-page"><Header right={<Link to="/my-research" className="btn btn-ghost">My Research</Link>} /><main className="container editor-page"><div className="editor-state editor-state--error"><strong>Editor couldn't load.</strong><span>{message}</span><button className="btn btn-cream" onClick={loadEditor}>Retry</button></div></main></div>;

  return (
    <div className="hx-page editor-page-shell">
      <Header right={<Link to={`/storyboard/${id}?stage=preview`} className="btn btn-ghost">Back to project</Link>} />
      <main className="container editor-page">
        <div className="editor-head">
          <div>
            <p className="eyebrow">Advanced editor · non-destructive</p>
            <h1>{project?.title || "Untitled project"}</h1>
            <p>Independent timeline. Your Storyboard, narration and source media stay unchanged.</p>
          </div>
          <div className="editor-head__actions">
            <span className="editor-save-state">{saving ? "Saving…" : message || `Version ${version}`}</span>
            <button className="btn btn-cream" type="button" onClick={() => void saveTimeline()} disabled={saving}>Save changes</button>
          </div>
        </div>

        <section className="editor-workspace">
          <div className="editor-preview-panel">
            <div className="editor-preview-frame">
              {selectedVideo?.src ? <video key={selectedVideo.id} src={selectedVideo.src} poster={selectedVideo.thumbnailUrl || undefined} controls playsInline /> : <div className="editor-preview-empty">No visual selected</div>}
              {selectedVideo?.title && <div className="editor-preview-title">{selectedVideo.title}</div>}
            </div>
            <div className="editor-preview-meta"><span>{formatTime(timeline?.duration)}</span><span>1080 × 1920 · {timeline?.fps || 30} fps</span></div>
          </div>

          <aside className="editor-inspector">
            <div className="editor-panel-heading"><span>Inspector</span><span className="mono-label">{selected?.trackName || "Nothing selected"}</span></div>
            {!selected && <div className="editor-inspector__empty">Select a clip on the timeline to edit it.</div>}
            {selected && (
              <div className="editor-inspector__form">
                <label>Start<input type="number" min="0" step="0.1" value={selected.start} onChange={(event) => setClipValue("start", Number(event.target.value))} /></label>
                <label>Duration<input type="number" min="0.1" step="0.1" value={selected.duration} onChange={(event) => setClipValue("duration", Number(event.target.value))} /></label>
                {selected.type === "audio" && <label>Volume<input type="number" min="0" max="2" step="0.05" value={selected.volume ?? 1} onChange={(event) => setClipValue("volume", Number(event.target.value))} /></label>}
                {selected.type === "caption" && <label>Caption text<textarea value={selected.text || ""} onChange={(event) => setClipValue("text", event.target.value)} rows="5" /></label>}
                {selected.type === "overlay" && <label>Overlay text<textarea value={selected.text || ""} onChange={(event) => setClipValue("text", event.target.value)} rows="4" /></label>}
                <div className="editor-inspector__buttons">
                  <button className="btn btn-ghost" onClick={() => moveClip(-1)} disabled={selected.trackId !== "video"}>Move left</button>
                  <button className="btn btn-ghost" onClick={() => moveClip(1)} disabled={selected.trackId !== "video"}>Move right</button>
                  <button className="btn btn-ghost" onClick={splitClip}>Split</button>
                  <button className="btn btn-danger" onClick={deleteSelected} disabled={selected.trackId === "narration"}>Delete</button>
                </div>
              </div>
            )}
            <button className="btn btn-ghost editor-add-overlay" onClick={addOverlay}>+ Add text overlay</button>
          </aside>
        </section>

        <section className="editor-timeline-panel">
          <div className="editor-timeline-toolbar">
            <div><strong>Timeline</strong><span>{formatTime(timeline?.duration)} total</span></div>
            <span className="mono-label">Autosave enabled · independent editor version</span>
          </div>
          <div className="editor-timeline-scroll">
            <div className="editor-timeline-ruler" style={{ minWidth: `${Math.max(760, (timeline?.duration || 1) * 80)}px` }}>
              {Array.from({ length: Math.max(2, Math.ceil((timeline?.duration || 1) / 5) + 1) }).map((_, index) => <span key={index} style={{ left: `${index * 400}px` }}>{formatTime(index * 5)}</span>)}
            </div>
            <div className="editor-tracks" style={{ minWidth: `${Math.max(760, (timeline?.duration || 1) * 80)}px` }}>
              {TRACK_ORDER.map((trackId) => {
                const track = timeline?.tracks?.find((item) => item.id === trackId);
                if (!track) return null;
                return <div className="editor-track" key={track.id}>
                  <div className="editor-track-label"><strong>{track.name}</strong><span>{track.clips.length} clips</span></div>
                  <div className="editor-track-lane">
                    {track.clips.map((clip) => <button key={clip.id} type="button" className={`editor-clip editor-clip--${track.kind} ${selectedClip.clipId === clip.id ? "is-selected" : ""}`} style={{ left: `${clip.start * 80}px`, width: `${Math.max(56, clip.duration * 80)}px` }} onClick={() => setSelectedClip({ trackId: track.id, clipId: clip.id })}>
                      <span>{clip.title || clip.text || clip.type}</span><small>{formatTime(clip.duration)}</small>
                    </button>)}
                  </div>
                </div>;
              })}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
