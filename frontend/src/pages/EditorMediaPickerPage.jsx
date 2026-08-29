import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import { useAuth } from "../context/AuthContext";
import "../components/ui.css";
import "./EditorMediaPickerPage.css";

const FILTERS = [
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function timelineEnd(track) {
  return (track?.clips || []).reduce((max, clip) => Math.max(max, Number(clip.start || 0) + Number(clip.duration || 0)), 0);
}

function applyMediaLoad(setMedia, setStatus, items) {
  setMedia(items);
  setStatus("ready");
}

function applyMediaLoadError(setStatus, setMessage, error) {
  setStatus("error");
  setMessage(error.message || "Failed to load project media.");
}

export default function EditorMediaPickerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const clipSequenceRef = useRef(0);
  const [media, setMedia] = useState([]);
  const [filter, setFilter] = useState("video");
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState("");
  const [query, setQuery] = useState("");

  const requestMedia = useCallback(async () => {
    const response = await fetch(`/api/projects/${id}/media`, { credentials: "include", cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Failed to load project media.");
    return data.media || [];
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    void requestMedia()
      .then((items) => {
        if (cancelled) return;
        applyMediaLoad(setMedia, setStatus, items);
      })
      .catch((error) => {
        if (cancelled) return;
        applyMediaLoadError(setStatus, setMessage, error);
      });
    return () => { cancelled = true; };
  }, [requestMedia]);

  const retryLoad = useCallback(() => {
    setStatus("loading");
    setMessage("");
    void requestMedia()
      .then((items) => {
        applyMediaLoad(setMedia, setStatus, items);
      })
      .catch((error) => {
        applyMediaLoadError(setStatus, setMessage, error);
      });
  }, [requestMedia]);

  const visibleMedia = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return media
      .filter((item) => item.kind === filter)
      .filter((item) => !normalized || `${item.title || ""} ${item.filename || ""} ${item.provider || ""}`.toLowerCase().includes(normalized));
  }, [filter, media, query]);

  async function addToEditor(item) {
    if (!item) return;
    setSavingId(item.id);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${id}/editor`, { credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to load editor state.");

      const timeline = clone(data.editor.timeline || {});
      const targetTrackId = item.kind === "audio" ? "music" : "video";
      const trackIndex = (timeline.tracks || []).findIndex((track) => track.id === targetTrackId);
      if (trackIndex < 0) throw new Error(`Editor ${targetTrackId} track is unavailable.`);

      const track = timeline.tracks[trackIndex];
      const start = Number(timelineEnd(track).toFixed(3));
      const mediaDuration = Number(item.durationSeconds || 0);
      const duration = Math.max(0.5, Math.min(item.kind === "audio" ? 30 : 15, mediaDuration > 0 ? mediaDuration : 4));
      clipSequenceRef.current += 1;
      const clipId = `media-${item.id}-${clipSequenceRef.current}`;
      const clip = item.kind === "audio"
        ? {
          id: clipId,
          type: "audio",
          mediaId: item.id,
          src: item.mediaUrl,
          start,
          duration,
          offset: 0,
          volume: 0.35,
          fadeIn: Math.min(0.5, duration / 2),
          fadeOut: Math.min(0.5, duration / 2),
          title: item.title || "Music",
        }
        : {
          id: clipId,
          type: "video",
          mediaId: item.id,
          assetId: null,
          src: item.proxyUrl || item.mediaUrl,
          thumbnailUrl: item.thumbnailUrl,
          start,
          duration,
          offset: 0,
          title: item.title || "Project media",
          transitionIn: { preset: "none", duration: 0.35 },
          transitionOut: { preset: "none", duration: 0.35 },
          effect: { preset: "none", intensity: 0.5 },
        };

      timeline.tracks[trackIndex] = { ...track, clips: [...(track.clips || []), clip] };
      const saveResponse = await fetch(`/api/projects/${id}/editor`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: data.editor.version, timeline }),
      });
      const saveData = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok) throw new Error(saveData.error || "Failed to add media to editor.");

      navigate(`/editor/${id}`, { replace: true });
    } catch (error) {
      setMessage(error.message || "Failed to add media to editor.");
    } finally {
      setSavingId("");
    }
  }

  if (!user) return null;
  if (status === "loading") return <div className="hx-page"><Header /><main className="container editor-media-picker"><div className="editor-state">Loading project media…</div></main></div>;
  if (status === "error") return <div className="hx-page"><Header right={<Link to={`/editor/${id}`} className="btn btn-ghost">Back to editor</Link>} /><main className="container editor-media-picker"><div className="editor-state editor-state--error"><strong>Media picker couldn’t load.</strong><span>{message}</span><button className="btn btn-cream" onClick={retryLoad}>Retry</button></div></main></div>;

  return <div className="hx-page">
    <Header right={<Link to={`/editor/${id}`} className="btn btn-ghost">Back to editor</Link>} />
    <main className="container editor-media-picker">
      <header className="editor-media-picker__header">
        <div><p className="eyebrow">Advanced editor · media picker</p><h1>Add project media</h1><p>Select an uploaded or imported asset and add it to the end of the matching editor track. Storyboard source records remain unchanged.</p></div>
        <span className="editor-save-state">{media.length} library assets</span>
      </header>

      <div className="editor-media-picker__toolbar">
        <div className="editor-media-picker__filters">{FILTERS.map((item) => <button key={item.value} type="button" className={`btn btn-ghost ${filter === item.value ? "is-active" : ""}`} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div>
        <input aria-label="Search project media" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search media" />
      </div>

      {message && <p className="media-library__message" role="status">{message}</p>}
      {!visibleMedia.length && <div className="editor-media-picker__empty"><strong>No matching media.</strong><span>Upload or import assets from the Media Library first.</span></div>}

      <div className="editor-media-picker__grid">
        {visibleMedia.map((item) => <article className="editor-media-picker__card" key={item.id}>
          <div className="editor-media-picker__preview">
            {item.kind === "video" ? <video src={item.proxyUrl || item.mediaUrl} poster={item.thumbnailUrl || undefined} muted playsInline preload="metadata" controls /> : <audio src={item.mediaUrl} controls preload="metadata" />}
          </div>
          <div className="editor-media-picker__body">
            <div><strong>{item.title}</strong><span>{item.provider || item.origin} · {item.kind}{item.durationSeconds ? ` · ${Number(item.durationSeconds).toFixed(1)}s` : ""}</span></div>
            <button className="btn btn-cream" type="button" disabled={savingId === item.id} onClick={() => void addToEditor(item)}>{savingId === item.id ? "Adding…" : item.kind === "audio" ? "Add to music" : "Add to video"}</button>
          </div>
        </article>)}
      </div>
    </main>
  </div>;
}
