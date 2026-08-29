import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Header from "../components/Header";
import { useAuth } from "../context/AuthContext";
import EditorWaveform from "../components/EditorWaveform";
import "../components/ui.css";
import "./AdvancedEditorPage.css";

const TRACK_ORDER = ["video", "narration", "music", "captions", "overlays"];
const FPS = 30;
const FRAME = 1 / FPS;
const GRID = 0.25;
const PX_PER_SECOND = 90;

const TRANSITION_PRESETS = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade" },
  { value: "slide-left", label: "Slide left" },
  { value: "slide-right", label: "Slide right" },
  { value: "zoom", label: "Zoom" },
];

const EFFECT_PRESETS = [
  { value: "none", label: "None" },
  { value: "slow-zoom-in", label: "Slow zoom in" },
  { value: "slow-zoom-out", label: "Slow zoom out" },
  { value: "pan-left", label: "Pan left" },
  { value: "pan-right", label: "Pan right" },
];

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function formatTime(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  const frames = Math.floor((total - Math.floor(total)) * FPS + 0.001);
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(frames).padStart(2, "0")}`;
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function snap(value, mode) {
  const numeric = Math.max(0, Number(value) || 0);
  if (mode === "free") return Number(numeric.toFixed(3));
  const step = mode === "frame" ? FRAME : GRID;
  return Number((Math.round(numeric / step) * step).toFixed(3));
}
function ensureMusicTrack(timeline) {
  const current = timeline?.tracks || [];
  if (current.some((track) => track.id === "music")) return timeline;
  return { ...timeline, tracks: [...current, { id: "music", kind: "audio", name: "Music", locked: false, muted: false, clips: [] }] };
}
function normalizeTimeline(timeline) {
  if (!timeline) return timeline;
  const next = ensureMusicTrack(timeline);
  return { ...next, fps: FPS, width: 1080, height: 1920 };
}
function updateTrack(timeline, trackId, updater) {
  return { ...timeline, tracks: timeline.tracks.map((track) => track.id === trackId ? updater(track) : track) };
}
function normalizeTransition(transition) {
  return {
    preset: String(transition?.preset || "none"),
    duration: clamp(Number(transition?.duration ?? 0.35), 0.05, 1.5),
  };
}
function normalizeEffect(effect) {
  return {
    preset: String(effect?.preset || "none"),
    intensity: clamp(Number(effect?.intensity ?? 0.5), 0, 1),
  };
}
function getVisualPreviewStyle(clip, playhead) {
  if (!clip) return undefined;
  const duration = Math.max(0.05, Number(clip.duration || 1));
  const local = clamp((Number(playhead || 0) - Number(clip.start || 0)) / duration, 0, 1);
  const transitionIn = normalizeTransition(clip.transitionIn);
  const transitionOut = normalizeTransition(clip.transitionOut);
  const effect = normalizeEffect(clip.effect);
  const effectStrength = effect.intensity;
  let scale = 1;
  let x = 0;
  let opacity = 1;

  if (effect.preset === "slow-zoom-in") scale = 1 + 0.12 * effectStrength * local;
  if (effect.preset === "slow-zoom-out") scale = 1.12 - 0.12 * effectStrength * local;
  if (effect.preset === "pan-left") { scale = 1 + 0.08 * effectStrength; x = -18 * effectStrength * local; }
  if (effect.preset === "pan-right") { scale = 1 + 0.08 * effectStrength; x = 18 * effectStrength * local; }

  const inDuration = Math.min(transitionIn.duration, duration / 2);
  const outDuration = Math.min(transitionOut.duration, duration / 2);
  const localSeconds = local * duration;
  const remaining = duration - localSeconds;

  if (transitionIn.preset !== "none" && inDuration > 0 && localSeconds < inDuration) {
    const progress = clamp(localSeconds / inDuration, 0, 1);
    if (transitionIn.preset === "fade") opacity *= progress;
    if (transitionIn.preset === "slide-left") x += (1 - progress) * -100;
    if (transitionIn.preset === "slide-right") x += (1 - progress) * 100;
    if (transitionIn.preset === "zoom") scale *= 0.9 + progress * 0.1;
  }

  if (transitionOut.preset !== "none" && outDuration > 0 && remaining < outDuration) {
    const progress = clamp(remaining / outDuration, 0, 1);
    if (transitionOut.preset === "fade") opacity *= progress;
    if (transitionOut.preset === "slide-left") x += (1 - progress) * 100;
    if (transitionOut.preset === "slide-right") x += (1 - progress) * -100;
    if (transitionOut.preset === "zoom") scale *= 1 + (1 - progress) * 0.1;
  }

  return {
    transform: `translate3d(${x}%, 0, 0) scale(${scale})`,
    transformOrigin: "center center",
    opacity,
  };
}

export default function AdvancedEditorPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [project, setProject] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [scenes, setScenes] = useState([]);
  const [version, setVersion] = useState(1);
  const [selectedClip, setSelectedClip] = useState({ trackId: "video", clipId: "" });
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(PX_PER_SECOND);
  const [snapMode, setSnapMode] = useState("grid");
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [dragState, setDragState] = useState(null);
  const videoRef = useRef(null);
  const saveTimer = useRef(null);
  const timelineRef = useRef(null);
  const playheadRef = useRef(0);
  const audioRefs = useRef(new Map());
  const activeAudioIdsRef = useRef(new Set());

  const loadEditor = useCallback(async () => {
    setStatus("loading"); setMessage(""); setDirty(false); setHistory([]); setFuture([]); setIsPlaying(false);
    try {
      const response = await fetch(`/api/projects/${id}/editor`, { credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to load editor.");
      const nextTimeline = normalizeTimeline(data.editor.timeline);
      setProject(data.project); setScenes(data.scenes || []); setTimeline(nextTimeline); setVersion(data.editor.version);
      const first = nextTimeline?.tracks?.find((track) => track.id === "video")?.clips?.[0];
      setSelectedClip({ trackId: "video", clipId: first?.id || "" }); setPlayhead(first?.start || 0); setStatus("ready");
    } catch (error) { setStatus("error"); setMessage(error.message || "Failed to load editor."); }
  }, [id]);

  useEffect(() => { if (user) void loadEditor(); }, [loadEditor, user]);
  useEffect(() => () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); }, []);
  useEffect(() => { timelineRef.current = timeline; }, [timeline]);
  useEffect(() => { playheadRef.current = playhead; }, [playhead]);

  const selected = useMemo(() => {
    if (!timeline || !selectedClip.clipId) return null;
    for (const track of timeline.tracks || []) {
      const clip = track.clips?.find((item) => item.id === selectedClip.clipId);
      if (clip) return { ...clip, trackId: track.id, trackName: track.name };
    }
    return null;
  }, [timeline, selectedClip]);

  const selectedVideo = useMemo(() => timeline?.tracks?.find((track) => track.id === "video")?.clips?.find((item) => item.id === selectedClip.clipId) || timeline?.tracks?.find((track) => track.id === "video")?.clips?.[0] || null, [timeline, selectedClip]);
  const selectedScene = useMemo(() => scenes.find((scene) => scene.id === selectedVideo?.sourceId) || null, [scenes, selectedVideo]);
  const duration = Number(timeline?.duration || 0);
  const timelineWidth = Math.max(900, duration * zoom + 160);
  const selectedVisualStyle = useMemo(() => getVisualPreviewStyle(selectedVideo, playhead), [selectedVideo, playhead]);

  useEffect(() => {
    if (!selectedVideo?.src || !videoRef.current) return;
    if (isPlaying) return;
    const local = clamp(playhead - Number(selectedVideo.start || 0), 0, Number(selectedVideo.duration || 0));
    videoRef.current.currentTime = Number(selectedVideo.offset || 0) + local;
  }, [playhead, selectedVideo, isPlaying]);

  const getAudioClips = useCallback(() => {
    const current = timelineRef.current;
    if (!current) return [];
    return current.tracks
      .filter((track) => track.kind === "audio" && !track.muted)
      .flatMap((track) => (track.clips || []).map((clip) => ({ ...clip, trackId: track.id })))
      .filter((clip) => clip.src);
  }, []);

  const effectiveVolume = useCallback((clip, time) => {
    const local = time - Number(clip.start || 0);
    const clipDuration = Number(clip.duration || 0);
    if (local < 0 || local > clipDuration) return 0;
    const base = clamp(Number(clip.volume ?? 1), 0, 1);
    const fadeIn = Math.min(Number(clip.fadeIn || 0), clipDuration / 2);
    const fadeOut = Math.min(Number(clip.fadeOut || 0), clipDuration / 2);
    const inGain = fadeIn > 0 ? clamp(local / fadeIn, 0, 1) : 1;
    const outGain = fadeOut > 0 ? clamp((clipDuration - local) / fadeOut, 0, 1) : 1;
    return base * Math.min(inGain, outGain);
  }, []);

  const syncAudioAtPlayhead = useCallback(async () => {
    const time = playheadRef.current;
    const clips = getAudioClips();
    const nextActive = new Set();

    for (const clip of clips) {
      const start = Number(clip.start || 0);
      const clipDuration = Number(clip.duration || 0);
      const end = start + clipDuration;
      const audio = audioRefs.current.get(clip.id);
      if (!audio) continue;

      if (time >= start && time < end) {
        nextActive.add(clip.id);
        audio.volume = effectiveVolume(clip, time);
        const localTime = clamp(time - start, 0, clipDuration);
        const desired = Number(clip.offset || 0) + localTime;
        if (Math.abs(audio.currentTime - desired) > 0.08) audio.currentTime = desired;
        if (audio.paused && isPlaying) {
          try { await audio.play(); } catch { /* Browser autoplay policy may delay playback until user gesture. */ }
        }
      } else if (!audio.paused) {
        audio.pause();
      }
    }

    activeAudioIdsRef.current = nextActive;
  }, [effectiveVolume, getAudioClips, isPlaying]);

  useEffect(() => {
    if (!isPlaying) {
      for (const audio of audioRefs.current.values()) audio.pause();
      videoRef.current?.pause();
      return undefined;
    }

    let cancelled = false;
    const startPlayback = async () => {
      if (cancelled) return;
      try { await videoRef.current?.play(); } catch { /* A play request may wait for a direct user gesture. */ }
      await syncAudioAtPlayhead();
    };
    void startPlayback();

    const interval = window.setInterval(() => { void syncAudioAtPlayhead(); }, 80);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      for (const audio of audioRefs.current.values()) audio.pause();
      videoRef.current?.pause();
    };
  }, [isPlaying, syncAudioAtPlayhead]);

  useEffect(() => {
    if (!isPlaying || !duration) return undefined;
    let raf = 0;
    let last = performance.now();
    const tick = (now) => {
      const delta = (now - last) / 1000; last = now;
      setPlayhead((current) => {
        const next = current + delta;
        if (next >= duration) { setIsPlaying(false); return duration; }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, duration]);

  useEffect(() => {
    const activeVideo = selectedVideo;
    if (!isPlaying || !activeVideo || !videoRef.current) return undefined;
    const handleTimeUpdate = () => {
      const local = clamp(Number(videoRef.current.currentTime || 0) - Number(activeVideo.offset || 0), 0, Number(activeVideo.duration || 0));
      const next = Number((Number(activeVideo.start || 0) + local).toFixed(3));
      playheadRef.current = next;
    };
    const video = videoRef.current;
    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [isPlaying, selectedVideo]);

  const saveTimeline = useCallback(async (nextTimeline = timeline) => {
    if (!nextTimeline || saving) return;
    setSaving(true); setMessage("Saving…");
    try {
      const response = await fetch(`/api/projects/${id}/editor`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, timeline: nextTimeline }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to save editor changes.");
      setVersion(data.editor.version); setTimeline(normalizeTimeline(data.editor.timeline)); setDirty(false); setMessage("Saved");
    } catch (error) { setMessage(error.message || "Failed to save changes."); }
    finally { setSaving(false); }
  }, [id, saving, timeline, version]);

  useEffect(() => {
    if (!dirty || status !== "ready" || !timeline) return undefined;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void saveTimeline(timelineRef.current), 900);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [dirty, status, timeline, saveTimeline]);

  const mutate = useCallback((transform, nextSelection) => {
    const current = timelineRef.current;
    if (!current) return;
    const next = transform(clone(current));
    setHistory((items) => [...items.slice(-39), clone(current)]);
    setFuture([]); setTimeline(next); setDirty(true); setMessage("Unsaved changes");
    if (nextSelection) setSelectedClip(nextSelection);
  }, []);

  const undo = useCallback(() => {
    if (!timeline || !history.length) return;
    const previous = history[history.length - 1];
    setFuture((items) => [clone(timeline), ...items].slice(0, 40));
    setHistory((items) => items.slice(0, -1)); setTimeline(previous); setDirty(true); setMessage("Undo · unsaved changes");
  }, [history, timeline]);
  const redo = useCallback(() => {
    if (!timeline || !future.length) return;
    const next = future[0];
    setHistory((items) => [...items.slice(-39), clone(timeline)]); setFuture((items) => items.slice(1)); setTimeline(next); setDirty(true); setMessage("Redo · unsaved changes");
  }, [future, timeline]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = event.target?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || event.target?.isContentEditable) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      if (mod && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
      if (event.code === "Space") { event.preventDefault(); setIsPlaying((value) => !value); return; }
      if (event.key === "ArrowLeft") { event.preventDefault(); setPlayhead((value) => clamp(Number((value - FRAME).toFixed(3)), 0, duration)); return; }
      if (event.key === "ArrowRight") { event.preventDefault(); setPlayhead((value) => clamp(Number((value + FRAME).toFixed(3)), 0, duration)); return; }
      if (event.key.toLowerCase() === "s") splitSelected();
      if (event.key === "Delete" || event.key === "Backspace") deleteSelected();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function splitSelected() {
    if (!selected || selected.duration < FRAME * 2) return;
    const firstDuration = Number((selected.duration / 2).toFixed(3));
    const firstId = `${selected.id}-a`;
    const secondId = `${selected.id}-b`;
    mutate((current) => updateTrack(current, selected.trackId, (track) => ({
      ...track,
      clips: track.clips.flatMap((clip) => clip.id !== selected.id ? [clip] : [
        { ...clip, id: firstId, duration: firstDuration },
        { ...clip, id: secondId, start: Number((clip.start + firstDuration).toFixed(3)), duration: Number((clip.duration - firstDuration).toFixed(3)), offset: Number(clip.offset || 0) + firstDuration },
      ]),
    })), { trackId: selected.trackId, clipId: firstId });
  }

  function deleteSelected() {
    if (!selected || selected.trackId === "narration") return;
    mutate((current) => updateTrack(current, selected.trackId, (track) => ({ ...track, clips: track.clips.filter((clip) => clip.id !== selected.id) })), { trackId: "video", clipId: "" });
  }

  function updateSelected(field, rawValue) {
    if (!selected) return;
    const numeric = Number(rawValue);
    let value = rawValue;
    if (field === "start") value = snap(numeric, snapMode);
    if (field === "duration") value = Math.max(0.05, Number.isFinite(numeric) ? numeric : selected.duration);
    mutate((current) => updateTrack(current, selected.trackId, (track) => ({ ...track, clips: track.clips.map((clip) => clip.id === selected.id ? { ...clip, [field]: value } : clip) })));
  }

  function updateSelectedTransition(edge, field, rawValue) {
    if (!selected || selected.trackId !== "video") return;
    const currentTransition = normalizeTransition(selected[edge]);
    const nextValue = field === "duration"
      ? clamp(Number(rawValue) || currentTransition.duration, 0.05, Math.min(1.5, Number(selected.duration || 1) / 2))
      : String(rawValue || "none");
    const transition = { ...currentTransition, [field]: nextValue };
    mutate((current) => updateTrack(current, "video", (track) => ({
      ...track,
      clips: track.clips.map((clip) => clip.id === selected.id ? { ...clip, [edge]: transition } : clip),
    })));
  }

  function updateSelectedEffect(field, rawValue) {
    if (!selected || selected.trackId !== "video") return;
    const currentEffect = normalizeEffect(selected.effect);
    const nextValue = field === "intensity" ? clamp(Number(rawValue) || 0, 0, 1) : String(rawValue || "none");
    const effect = { ...currentEffect, [field]: nextValue };
    mutate((current) => updateTrack(current, "video", (track) => ({
      ...track,
      clips: track.clips.map((clip) => clip.id === selected.id ? { ...clip, effect } : clip),
    })));
  }

  function replaceVisual(asset) {
    if (!selected || selected.trackId !== "video" || !asset) return;
    mutate((current) => updateTrack(current, "video", (track) => ({ ...track, clips: track.clips.map((clip) => clip.id === selected.id ? { ...clip, assetId: asset.id, src: asset.videoUrl, thumbnailUrl: asset.thumbnailUrl } : clip) })));
  }

  function addMusicClip() {
    const clipId = `music-${Date.now()}`;
    mutate((current) => updateTrack(current, "music", (track) => ({ ...track, clips: [...track.clips, { id: clipId, type: "audio", start: snap(playhead, current.snapMode || snapMode), duration: Math.min(8, Math.max(2, duration - playhead || 8)), volume: 0.35, fadeIn: 0.5, fadeOut: 0.5, title: "Music bed", src: null }] })), { trackId: "music", clipId });
  }

  function selectClip(trackId, clipId) {
    const clip = timeline?.tracks?.find((track) => track.id === trackId)?.clips?.find((item) => item.id === clipId);
    setSelectedClip({ trackId, clipId }); if (clip) setPlayhead(Number(clip.start || 0)); setIsPlaying(false);
  }

  function beginDrag(event, trackId, clip) {
    if (event.button !== 0) return;
    event.stopPropagation();
    setSelectedClip({ trackId, clipId: clip.id }); setIsPlaying(false);
    setDragState({ mode: "move", trackId, clipId: clip.id, originX: event.clientX, start: clip.start });
  }
  function beginResize(event, trackId, clip, edge) {
    event.stopPropagation();
    setSelectedClip({ trackId, clipId: clip.id }); setIsPlaying(false);
    setDragState({ mode: edge, trackId, clipId: clip.id, originX: event.clientX, start: clip.start, duration: clip.duration });
  }

  useEffect(() => {
    if (!dragState) return undefined;
    const onMove = (event) => {
      const current = timelineRef.current;
      const track = current?.tracks?.find((item) => item.id === dragState.trackId);
      const clip = track?.clips?.find((item) => item.id === dragState.clipId);
      if (!current || !clip) return;
      const delta = (event.clientX - dragState.originX) / zoom;
      if (dragState.mode === "move") {
        const nextStart = snap(Math.max(0, dragState.start + delta), snapMode);
        setTimeline(updateTrack(current, dragState.trackId, (item) => ({ ...item, clips: item.clips.map((entry) => entry.id === clip.id ? { ...entry, start: nextStart } : entry) })));
      } else if (dragState.mode === "left") {
        const end = dragState.start + dragState.duration;
        const nextStart = clamp(snap(dragState.start + delta, snapMode), 0, end - FRAME);
        const nextDuration = Number((end - nextStart).toFixed(3));
        setTimeline(updateTrack(current, dragState.trackId, (item) => ({ ...item, clips: item.clips.map((entry) => entry.id === clip.id ? { ...entry, start: nextStart, duration: nextDuration, offset: Math.max(0, Number(entry.offset || 0) + nextStart - entry.start) } : entry) })));
      } else {
        const nextDuration = Math.max(FRAME, Number(snap(dragState.duration + delta, snapMode).toFixed(3)));
        setTimeline(updateTrack(current, dragState.trackId, (item) => ({ ...item, clips: item.clips.map((entry) => entry.id === clip.id ? { ...entry, duration: nextDuration } : entry) })));
      }
      setDirty(true); setMessage("Unsaved changes");
    };
    const onUp = () => { setDragState(null); };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [dragState, snapMode, zoom]);

  const getAudioRef = useCallback((clipId, node) => {
    if (node) audioRefs.current.set(clipId, node);
    else audioRefs.current.delete(clipId);
  }, []);

  if (!user) return null;
  if (status === "loading") return <div className="hx-page"><Header /><main className="container advanced-editor"><div className="editor-state" role="status" aria-live="polite"><strong>Loading editor…</strong><span>Preparing your independent editing timeline.</span></div></main></div>;
  if (status === "error") return <div className="hx-page"><Header right={<Link to="/my-research" className="btn btn-ghost">My Research</Link>} /><main className="container advanced-editor"><div className="editor-state editor-state--error" role="alert"><strong>Editor couldn’t load.</strong><span>{message || "The editor request failed. Please try again."}</span><div className="editor-state__actions"><button className="btn btn-cream" onClick={loadEditor}>Retry</button><Link to="/my-research" className="btn btn-ghost">Back to My Research</Link></div></div></main></div>;
  if (!timeline) return <div className="hx-page"><Header right={<Link to={`/storyboard/${id}?stage=preview`} className="btn btn-ghost">Back to project</Link>} /><main className="container advanced-editor"><div className="editor-state"><strong>No editable timeline yet.</strong><span>This project has no timeline data available. Return to the project and create or regenerate the Storyboard.</span><div className="editor-state__actions"><button className="btn btn-cream" onClick={loadEditor}>Try again</button><Link to={`/storyboard/${id}?stage=preview`} className="btn btn-ghost">Back to project</Link></div></div></main></div>;

  const audioClips = timeline?.tracks?.filter((track) => track.kind === "audio").flatMap((track) => track.clips || []) || [];
  const selectedTransitionIn = normalizeTransition(selected?.transitionIn);
  const selectedTransitionOut = normalizeTransition(selected?.transitionOut);
  const selectedEffect = normalizeEffect(selected?.effect);

  return <div className="hx-page advanced-editor-shell">
    <Header right={<Link to={`/storyboard/${id}?stage=preview`} className="btn btn-ghost">Back to project</Link>} />
    <main className="container advanced-editor">
      <header className="advanced-editor__header">
        <div><p className="eyebrow">Advanced video editor · separate workspace</p><h1>{project?.title || "Untitled project"}</h1><p>Shape timing, visuals, captions and audio here without changing the original Storyboard.</p></div>
        <div className="advanced-editor__actions"><span className="editor-save-state">{saving ? "Saving…" : message || `Version ${version}`}</span><button className="btn btn-ghost" onClick={undo} disabled={!history.length}>Undo</button><button className="btn btn-ghost" onClick={redo} disabled={!future.length}>Redo</button><button className="btn btn-cream" onClick={() => void saveTimeline()} disabled={saving || !dirty}>{saving ? "Saving…" : "Save changes"}</button><Link className="btn btn-ghost" to={`/editor/${id}/render`}>Render MP4</Link></div>
      </header>

      <section className="advanced-editor__topgrid">
        <div className="editor-preview-card">
          <div className="editor-preview-frame">{selectedVideo?.src ? <video ref={videoRef} src={selectedVideo.src} poster={selectedVideo.thumbnailUrl || undefined} playsInline preload="metadata" style={selectedVisualStyle} /> : <div className="editor-preview-empty">Select a visual clip to preview it.</div>}</div>
          <div className="editor-preview-transport"><button className="btn btn-ghost" onClick={() => setIsPlaying((value) => !value)}>{isPlaying ? "Pause" : "Play"}</button><button className="btn btn-ghost" onClick={() => setPlayhead(clamp(playhead - FRAME, 0, duration))}>−1f</button><button className="btn btn-ghost" onClick={() => setPlayhead(clamp(playhead + FRAME, 0, duration))}>+1f</button><input aria-label="Timeline playhead" type="range" min="0" max={duration || 1} step={FRAME} value={clamp(playhead, 0, duration || 1)} onChange={(event) => { setPlayhead(Number(event.target.value)); setIsPlaying(false); }} /><strong>{formatTime(playhead)}</strong><span>/ {formatTime(duration)}</span></div>
          <div className="editor-audio-status"><span>{audioClips.filter((clip) => clip.src).length} playable audio clips</span><span>{selectedVideo?.effect?.preset && selectedVideo.effect.preset !== "none" ? `Effect: ${selectedVideo.effect.preset}` : "Waveforms load from project audio"}</span></div>
          {audioClips.map((clip) => clip.src ? <audio key={clip.id} ref={(node) => getAudioRef(clip.id, node)} src={clip.src} preload="metadata" /> : null)}
        </div>

        <aside className="advanced-editor__inspector">
          <div className="editor-section-title"><strong>Inspector</strong><span>{selected?.trackName || "Nothing selected"}</span></div>
          {!selected && <p className="editor-muted">Select a clip on the timeline to edit it.</p>}
          {selected && <div className="editor-form">
            <label>Start<input type="number" min="0" step={FRAME} value={selected.start} onChange={(event) => updateSelected("start", event.target.value)} /></label>
            <label>Duration<input type="number" min={FRAME} step={FRAME} value={selected.duration} onChange={(event) => updateSelected("duration", event.target.value)} /></label>
            {selected.trackId === "video" && selectedScene?.assets?.length > 0 && <label>Visual<select value={selected.assetId || ""} onChange={(event) => replaceVisual(selectedScene.assets.find((asset) => asset.id === event.target.value))}><option value="">Current</option>{selectedScene.assets.map((asset) => <option key={asset.id} value={asset.id}>Visual {asset.sortOrder + 1}</option>)}</select></label>}
            {selected.trackId === "video" && <div className="editor-form__panel"><div className="editor-form__subheading">Transitions</div><div className="editor-form__split"><label>In<select value={selectedTransitionIn.preset} onChange={(event) => updateSelectedTransition("transitionIn", "preset", event.target.value)}>{TRANSITION_PRESETS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>Out<select value={selectedTransitionOut.preset} onChange={(event) => updateSelectedTransition("transitionOut", "preset", event.target.value)}>{TRANSITION_PRESETS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div><div className="editor-form__split"><label>In duration<input type="number" min="0.05" max="1.5" step="0.05" value={selectedTransitionIn.duration} onChange={(event) => updateSelectedTransition("transitionIn", "duration", event.target.value)} /></label><label>Out duration<input type="number" min="0.05" max="1.5" step="0.05" value={selectedTransitionOut.duration} onChange={(event) => updateSelectedTransition("transitionOut", "duration", event.target.value)} /></label></div></div>}
            {selected.trackId === "video" && <div className="editor-form__panel"><div className="editor-form__subheading">Effect preset</div><label>Motion<select value={selectedEffect.preset} onChange={(event) => updateSelectedEffect("preset", event.target.value)}>{EFFECT_PRESETS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>Intensity<input type="range" min="0" max="1" step="0.05" value={selectedEffect.intensity} onChange={(event) => updateSelectedEffect("intensity", event.target.value)} /><span className="field-readout">{Math.round(selectedEffect.intensity * 100)}%</span></label></div>}
            {(selected.type === "audio" || selected.trackId === "music") && <><label>Volume<input type="range" min="0" max="1" step="0.01" value={selected.volume ?? 1} onChange={(event) => updateSelected("volume", event.target.value)} /><span className="field-readout">{Math.round((selected.volume ?? 1) * 100)}%</span></label><div className="editor-form__split"><label>Fade in<input type="number" min="0" max="2" step="0.1" value={selected.fadeIn ?? 0} onChange={(event) => updateSelected("fadeIn", event.target.value)} /></label><label>Fade out<input type="number" min="0" max="2" step="0.1" value={selected.fadeOut ?? 0} onChange={(event) => updateSelected("fadeOut", event.target.value)} /></label></div></>}
            {selected.type === "caption" && <><label>Caption text<textarea rows="4" value={selected.text || ""} onChange={(event) => updateSelected("text", event.target.value)} /></label><div className="editor-form__split"><label>Position<select value={selected.position || "lower-middle"} onChange={(event) => updateSelected("position", event.target.value)}><option value="top">Top</option><option value="center">Center</option><option value="lower-middle">Lower middle</option><option value="bottom">Bottom</option></select></label><label>Style<select value={selected.style || "default"} onChange={(event) => updateSelected("style", event.target.value)}><option value="default">Default</option><option value="bold">Bold</option><option value="highlight">Highlight</option><option value="minimal">Minimal</option></select></label></div><label>Emphasis<select value={selected.emphasis || "none"} onChange={(event) => updateSelected("emphasis", event.target.value)}><option value="none">None</option><option value="keywords">Keywords</option><option value="all">All words</option></select></label></>}
            {selected.type === "overlay" && <><label>Overlay text<textarea rows="3" value={selected.text || ""} onChange={(event) => updateSelected("text", event.target.value)} /></label><label>Position<select value={selected.position || "center"} onChange={(event) => updateSelected("position", event.target.value)}><option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option></select></label></>}
            <div className="editor-form__actions"><button className="btn btn-ghost" onClick={splitSelected}>Split</button><button className="btn btn-danger" onClick={deleteSelected} disabled={selected.trackId === "narration"}>Delete</button></div>
          </div>}
          <button className="btn btn-ghost editor-add-music" onClick={addMusicClip}>+ Add music clip</button>
        </aside>
      </section>

      <section className="editor-timeline-card">
        <div className="editor-timeline-toolbar"><div><strong>Timeline</strong><span>{formatTime(duration)} · {timeline?.fps || FPS} fps</span></div><div className="editor-timeline-toolbar__controls"><label>Zoom<input type="range" min="50" max="180" step="5" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label><span>{Math.round(zoom)} px/s</span><select value={snapMode} onChange={(event) => setSnapMode(event.target.value)}><option value="grid">Snap grid</option><option value="frame">Snap frame</option><option value="free">Free</option></select></div></div>
        <div className="editor-timeline-scroll">
          <div className="editor-ruler" style={{ width: timelineWidth }} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setPlayhead(clamp(snap((event.clientX - rect.left) / zoom, snapMode), 0, duration)); setIsPlaying(false); }}><div className="editor-ruler__ticks">{Array.from({ length: Math.max(2, Math.ceil(duration / 5) + 1) }).map((_, index) => <span key={index} style={{ left: `${index * 5 * zoom}px` }}>{formatTime(index * 5)}</span>)}</div><div className="editor-playhead" style={{ left: `${playhead * zoom}px` }} /></div>
          <div className="editor-tracks" style={{ width: timelineWidth }}>
            {TRACK_ORDER.map((trackId) => { const track = timeline?.tracks?.find((item) => item.id === trackId); if (!track) return null; return <div className="editor-track" key={track.id}>
              <div className="editor-track-label"><strong>{track.name}</strong><span>{track.clips.length} clips</span></div>
              <div className="editor-track-lane" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setPlayhead(clamp(snap((event.clientX - rect.left) / zoom, snapMode), 0, duration)); setIsPlaying(false); }}>
                {track.clips.map((clip) => <button key={clip.id} type="button" className={`editor-clip editor-clip--${track.kind} ${selectedClip.clipId === clip.id ? "is-selected" : ""}`} style={{ left: `${clip.start * zoom}px`, width: `${Math.max(54, clip.duration * zoom)}px` }} onPointerDown={(event) => beginDrag(event, track.id, clip)} onClick={(event) => { event.stopPropagation(); selectClip(track.id, clip.id); }}>
                  <span>{clip.title || clip.text || clip.type}</span><small>{formatTime(clip.duration)}{track.kind === "video" && clip.effect?.preset && clip.effect.preset !== "none" ? ` · ${clip.effect.preset}` : ""}</small>
                  {(track.kind === "audio" && clip.src) && <EditorWaveform src={clip.src} progress={clamp((playhead - Number(clip.start || 0)) / Math.max(0.001, Number(clip.duration || 1)), 0, 1)} />}
                  <i className="editor-clip__handle editor-clip__handle--left" onPointerDown={(event) => beginResize(event, track.id, clip, "left")} /><i className="editor-clip__handle editor-clip__handle--right" onPointerDown={(event) => beginResize(event, track.id, clip, "right")} />
                </button>)}</div>
            </div>; })}
          </div>
        </div>
      </section>
      <p className="advanced-editor__hint">Keyboard: Space play/pause · ←/→ frame step · S split · Delete remove · Ctrl/Cmd+Z undo · Ctrl/Cmd+Y redo. Drag clips to move; drag edges to trim. Video clips support Remotion-safe transition/effect presets; narration waveforms and audio playback stay synchronized to the editor playhead.</p>
    </main>
  </div>;
}
