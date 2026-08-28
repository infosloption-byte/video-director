import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Header from "../components/Header";
import "../components/ui.css";
import "./MediaLibraryPage.css";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "video", label: "Video" },
  { value: "image", label: "Image" },
  { value: "audio", label: "Audio" },
  { value: "caption", label: "Captions" },
];

const FALLBACK_MIME_TYPES = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg",
  ".m4v": "video/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".txt": "text/plain",
  ".srt": "application/x-subrip",
  ".vtt": "text/vtt",
  ".ttml": "application/ttml+xml",
  ".xml": "application/ttml+xml",
};

function uploadKind(file) {
  const type = String(file?.type || "").toLowerCase();
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("audio/")) return "audio";
  const name = String(file?.name || "").toLowerCase();
  if (/\.(txt|srt|vtt|ttml|xml)$/.test(name)) return "caption";
  return null;
}

function uploadMimeType(file) {
  if (file?.type) return file.type;
  const name = String(file?.name || "").toLowerCase();
  const match = /\.[^.]+$/.exec(name);
  return (match && FALLBACK_MIME_TYPES[match[0]]) || "";
}

export default function MediaLibraryPage() {
  const { id } = useParams();
  const fileInputRef = useRef(null);
  const activeUploadRef = useRef(null);
  const [media, setMedia] = useState([]);
  const [query, setQuery] = useState("technology");
  const [filter, setFilter] = useState("all");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("loading");
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [upload, setUpload] = useState(null);

  const loadMedia = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${id}/media`, { credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to load media library.");
      setMedia(data.media || []);
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Failed to load media library.");
    }
  }, [id]);

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { void loadMedia(); }, [loadMedia]);

  const visibleMedia = useMemo(() => filter === "all" ? media : media.filter((item) => item.kind === filter), [filter, media]);

  async function searchExternalMedia(event) {
    event?.preventDefault();
    const normalized = String(query || "").trim();
    if (!normalized) return;
    setSearching(true);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${id}/media/search?query=${encodeURIComponent(normalized)}&limit=8`, { credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "External media search failed.");
      setResults(data.results || []);
    } catch (error) {
      setResults([]);
      setMessage(error.message || "External media search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function importExternal(result) {
    if (!result?.videoUrl) return;
    setSavingId(result.providerAssetId || result.videoUrl);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${id}/media`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "video",
          origin: "external",
          title: result.title || "Pexels video",
          mediaUrl: result.videoUrl,
          thumbnailUrl: result.thumbnailUrl,
          sourceUrl: result.sourceUrl,
          provider: "pexels",
          providerAssetId: result.providerAssetId,
          width: result.width,
          height: result.height,
          durationSeconds: result.durationSeconds,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to add media.");
      setMedia((items) => [data.media, ...items.filter((item) => item.id !== data.media.id)]);
      setMessage(data.created ? "Added to project library." : "Already in project library.");
    } catch (error) {
      setMessage(error.message || "Failed to add media.");
    } finally {
      setSavingId("");
    }
  }

  async function uploadSelectedFile() {
    const file = selectedFile;
    const kind = uploadKind(file);
    const mimeType = uploadMimeType(file);
    if (!file || !kind || !mimeType) {
      setMessage("Choose a supported video, image, audio, or caption file.");
      return;
    }

    setMessage("");
    setUpload({ name: file.name, kind, loaded: 0, total: file.size, percent: 0, error: "" });

    const params = new URLSearchParams({ kind, filename: file.name });
    const xhr = new XMLHttpRequest();
    activeUploadRef.current = xhr;

    try {
      await new Promise((resolve, reject) => {
        xhr.open("PUT", `/api/projects/${id}/media/upload?${params.toString()}`);
        xhr.withCredentials = true;
        xhr.setRequestHeader("Content-Type", mimeType);
        xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const percent = Math.round((event.loaded / event.total) * 100);
          setUpload((current) => current ? { ...current, loaded: event.loaded, total: event.total, percent } : current);
        };

        xhr.onerror = () => reject(new Error("Upload failed. Check the server connection and retry."));
        xhr.onabort = () => reject(new Error("Upload cancelled."));
        xhr.onload = () => {
          const data = (() => { try { return JSON.parse(xhr.responseText || "{}"); } catch { return {}; } })();
          if (xhr.status >= 200 && xhr.status < 300) {
            setMedia((items) => [data.media, ...items.filter((item) => item.id !== data.media.id)]);
            resolve();
          } else {
            reject(new Error(data.error || `Upload failed (${xhr.status}).`));
          }
        };
        xhr.send(file);
      });
      setUpload({ name: file.name, kind, loaded: file.size, total: file.size, percent: 100, error: "" });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMessage("Upload complete. Added to project library.");
    } catch (error) {
      setUpload((current) => current ? { ...current, error: error.message || "Upload failed." } : current);
      setMessage(error.message || "Upload failed.");
    } finally {
      activeUploadRef.current = null;
    }
  }

  function cancelUpload() {
    activeUploadRef.current?.abort();
    setUpload(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function removeMedia(item) {
    if (!item) return;
    setSavingId(item.id);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${id}/media/${item.id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to remove media.");
      }
      setMedia((items) => items.filter((entry) => entry.id !== item.id));
      setMessage("Removed from project library.");
    } catch (error) {
      setMessage(error.message || "Failed to remove media.");
    } finally {
      setSavingId("");
    }
  }

  if (status === "loading") return <div className="hx-page"><Header /><main className="container media-library"><div className="media-library__state">Loading media library…</div></main></div>;
  if (status === "error") return <div className="hx-page"><Header /><main className="container media-library"><div className="media-library__state media-library__state--error"><strong>Media library couldn’t load.</strong><span>{message}</span><button className="btn btn-cream" onClick={() => { setStatus("loading"); void loadMedia(); }}>Retry</button></div></main></div>;

  return <div className="hx-page">
    <Header right={<Link to={`/editor/${id}`} className="btn btn-ghost">Back to editor</Link>} />
    <main className="container media-library">
      <header className="media-library__header">
        <div><p className="eyebrow">Project media</p><h1>Media Library</h1><p>Upload reusable media or import external assets. Storyboard and source records remain unchanged.</p></div>
        <span className="editor-save-state">{media.length} assets</span>
      </header>

      <section className="media-library__upload-card">
        <div className="editor-section-title"><strong>Upload media</strong><span>Streamed to project storage</span></div>
        <div className="media-library__upload-row">
          <input ref={fileInputRef} type="file" accept="video/*,image/*,audio/*,.srt,.vtt,.ttml,.txt" onChange={(event) => { setSelectedFile(event.target.files?.[0] || null); setUpload(null); setMessage(""); }} />
          <button className="btn btn-cream" type="button" disabled={!selectedFile || Boolean(upload && upload.percent < 100 && !upload.error)} onClick={() => void uploadSelectedFile()}>{upload && upload.percent < 100 && !upload.error ? "Uploading…" : "Upload"}</button>
        </div>
        {selectedFile && <p className="media-library__file-meta"><strong>{selectedFile.name}</strong><span>{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB · {uploadKind(selectedFile) || "unsupported"}</span></p>}
        {upload && <div className="media-library__progress" role="status" aria-live="polite"><div className="media-library__progress-head"><span>{upload.name}</span><strong>{upload.percent}%</strong></div><progress max="100" value={upload.percent} /><div className="media-library__progress-foot"><span>{upload.error || (upload.percent === 100 ? "Uploaded" : "Uploading…")}</span>{upload.percent < 100 && !upload.error && <button className="btn btn-ghost" type="button" onClick={cancelUpload}>Cancel</button>}</div></div>}
      </section>

      <section className="media-library__search-card">
        <div className="editor-section-title"><strong>External library</strong><span>Pexels video search</span></div>
        <form className="media-library__search" onSubmit={searchExternalMedia}>
          <input aria-label="Search external media" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search B-roll, e.g. AI lab" />
          <button className="btn btn-cream" type="submit" disabled={searching}>{searching ? "Searching…" : "Search"}</button>
        </form>
        {results.length > 0 && <div className="media-library__results">{results.map((result) => <article className="media-result" key={result.providerAssetId || result.videoUrl}>
          <div className="media-result__thumb"><video src={result.videoUrl} poster={result.thumbnailUrl || undefined} muted playsInline preload="metadata" controls /></div>
          <div className="media-result__body"><strong>{result.title || "Pexels video"}</strong><span>{result.width && result.height ? `${result.width}×${result.height}` : "Portrait-ready"}</span><small>{result.photographer ? `By ${result.photographer}` : "Pexels"}</small><button className="btn btn-ghost" type="button" disabled={savingId === (result.providerAssetId || result.videoUrl)} onClick={() => void importExternal(result)}>{savingId === (result.providerAssetId || result.videoUrl) ? "Adding…" : "Add to library"}</button></div>
        </article>)}</div>}
      </section>

      <section className="media-library__library-card">
        <div className="media-library__toolbar"><div className="media-library__filters">{FILTERS.map((item) => <button className={`btn btn-ghost ${filter === item.value ? "is-active" : ""}`} key={item.value} type="button" onClick={() => setFilter(item.value)}>{item.label}</button>)}</div><span>{visibleMedia.length} shown</span></div>
        {message && <p className="media-library__message" role="status">{message}</p>}
        {!visibleMedia.length && <div className="media-library__empty"><strong>No media yet.</strong><span>Upload a file or search Pexels above to add reusable project assets.</span></div>}
        <div className="media-grid">{visibleMedia.map((item) => <article className="media-card" key={item.id}>
          <div className="media-card__preview">{item.kind === "video" ? <video src={item.mediaUrl} poster={item.thumbnailUrl || undefined} muted playsInline preload="metadata" controls /> : item.kind === "image" ? <img src={item.mediaUrl} alt="" /> : item.kind === "audio" ? <audio src={item.mediaUrl} controls preload="metadata" /> : <div className="media-card__placeholder">{item.kind}</div>}</div>
          <div className="media-card__body"><strong>{item.title}</strong><span>{item.provider || item.origin} · {item.kind}{item.sizeBytes ? ` · ${(item.sizeBytes / (1024 * 1024)).toFixed(1)} MB` : ""}</span><button className="btn btn-ghost" type="button" disabled={savingId === item.id} onClick={() => void removeMedia(item)}>{savingId === item.id ? "Removing…" : "Remove"}</button></div>
        </article>)}</div>
      </section>
    </main>
  </div>;
}
