import { useEffect, useMemo, useState } from "react";

const LABELS = { video: "Video", audio: "Audio", image: "Image" };

export default function EditorMediaPicker({ projectId, kind, onSelect, onClose }) {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/projects/${projectId}/media?kind=${encodeURIComponent(kind)}`, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Failed to load project media.");
        return data;
      })
      .then((data) => { if (active) setItems(data.media || []); })
      .catch((loadError) => { if (active) setError(loadError.message || "Failed to load project media."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, kind]);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => `${item.title || ""} ${item.filename || ""} ${item.provider || ""}`.toLowerCase().includes(normalized));
  }, [items, query]);

  return <div className="editor-media-picker">
    <div className="editor-media-picker__header">
      <div><strong>{LABELS[kind] || "Media"} library</strong><span>{items.length} available</span></div>
      <button className="btn btn-ghost" type="button" onClick={onClose}>Close</button>
    </div>
    <input className="editor-media-picker__search" aria-label={`Search project ${LABELS[kind] || "media"}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${LABELS[kind]?.toLowerCase() || "media"}`} />
    {loading && <div className="editor-media-picker__state">Loading media…</div>}
    {!loading && error && <div className="editor-media-picker__state editor-media-picker__state--error">{error}</div>}
    {!loading && !error && !visibleItems.length && <div className="editor-media-picker__state">No matching media. Add assets from the Media Library first.</div>}
    {!loading && !error && visibleItems.length > 0 && <div className="editor-media-picker__grid">{visibleItems.map((item) => <button className="editor-media-picker__item" key={item.id} type="button" onClick={() => onSelect(item)}>
      <div className="editor-media-picker__thumb">{item.kind === "video" ? <video src={item.mediaUrl} poster={item.thumbnailUrl || undefined} muted playsInline preload="metadata" /> : item.kind === "image" ? <img src={item.thumbnailUrl || item.mediaUrl} alt="" /> : <span>♪</span>}</div>
      <strong>{item.title}</strong>
      <small>{item.provider || item.origin}{item.durationSeconds ? ` · ${Number(item.durationSeconds).toFixed(1)}s` : ""}</small>
    </button>)}</div>}
  </div>;
}
