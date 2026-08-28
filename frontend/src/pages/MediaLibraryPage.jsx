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

function canvasBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function loadMediaElement(element, url, eventName) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      element.removeEventListener(eventName, resolve);
      element.removeEventListener("error", onError);
    };
    const onError = () => {
      cleanup();
      reject(new Error("The browser could not inspect the uploaded media."));
    };
    element.addEventListener(eventName, () => {
      cleanup();
      resolve();
    }, { once: true });
    element.addEventListener("error", onError, { once: true });
    element.src = url;
  });
}

async function inspectUploadedMedia(file) {
  const kind = uploadKind(file);
  const url = URL.createObjectURL(file);
  try {
    if (kind === "image") {
      const image = new Image();
      await loadMediaElement(image, url, "load");
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (!width || !height) return { width, height, thumbnail: null };

      const maxDimension = 720;
      const scale = Math.min(1, maxDimension / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) return { width, height, thumbnail: null };
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return { width, height, thumbnail: await canvasBlob(canvas) };
    }

    if (kind === "video") {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      await loadMediaElement(video, url, "loadedmetadata");
      const width = video.videoWidth;
      const height = video.videoHeight;
      const durationSeconds = Number.isFinite(video.duration) ? video.duration : null;
      if (!width || !height || !durationSeconds || durationSeconds <= 0) return { width, height, durationSeconds, thumbnail: null };

      const targetTime = Math.min(0.5, Math.max(0, durationSeconds - 0.05));
      if (video.readyState < 2) {
        await new Promise((resolve, reject) => {
          video.addEventListener("loadeddata", resolve, { once: true });
          video.addEventListener("error", () => reject(new Error("The browser could not decode the uploaded video.")), { once: true });
        });
      }
      if (targetTime > 0) {
        await new Promise((resolve, reject) => {
          video.addEventListener("seeked", resolve, { once: true });
          video.addEventListener("error", () => reject(new Error("The browser could not seek the uploaded video.")), { once: true });
          video.currentTime = targetTime;
        });
      }

      const maxDimension = 720;
      const scale = Math.min(1, maxDimension / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) return { width, height, durationSeconds, thumbnail: null };
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return { width, height, durationSeconds, thumbnail: await canvasBlob(canvas) };
    }

    if (kind === "audio") {
      const audio = document.createElement("audio");
      await loadMediaElement(audio, url, "loadedmetadata");
      return { durationSeconds: Number.isFinite(audio.duration) ? audio.duration : null, thumbnail: null };
    }

    return { thumbnail: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function patchMediaMetadata(projectId, mediaId, metadata) {
  const response = await fetch(`/api/projects/${projectId}/media/${mediaId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to save media metadata.");
  return data.media;
}

async function uploadMediaThumbnail(projectId, mediaId, thumbnail) {
  if (!thumbnail) return null;
  const response = await fetch(`/api/projects/${projectId}/media/${mediaId}/thumbnail`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "image/png", "X-Requested-With": "XMLHttpRequest" },
    body: thumbnail,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Failed to save media thumbnail.");
  return data.media;
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

  async function processUploadedMedia(file, uploadedMedia) {
    const inspected = await inspectUploadedMedia(file);
    const metadata = {};
    if (Number.isFinite(inspected.durationSeconds)) metadata.durationSeconds = inspected.durationSeconds;
    if (Number.isFinite(inspected.width) && inspected.width > 0) metadata.width = inspected.width;
    if (Number.isFinite(inspected.height) && inspected.height > 0) metadata.height = inspected.height;

    let updatedMedia = uploadedMedia;
    if (Object.keys(metadata).length) {
      updatedMedia = await patchMediaMetadata(id, uploadedMedia.id, metadata);
    }
    if (inspected.thumbnail) {
      updatedMedia = await uploadMediaThumbnail(id, uploadedMedia.id, inspected.thumbnail);
    }
    setMedia((items) => items.map((item) => item.id === updatedMedia.id ? updatedMedia : item));
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
    setUpload({ name: file.name, kind, loaded: 0, total: file.size, percent: 0, error: "", processing: false });

    const params = new URLSearchParams({ kind, filename: file.name });
    const xhr = new XMLHttpRequest();
    activeUploadRef.current = xhr;

    try {
      const uploadedMedia = await new Promise((resolve, reject) => {
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
          if (xhr.status >= 200 && xhr.status < 300 && data.media) {
            setMedia((items) => [data.media, ...items.filter((item) => item.id !== data.media.id)]);
            resolve(data.media);
          } else {
            reject(new Error(data.error || `Upload failed (${xhr.status}).`));
          }
        };
        xhr.send(file);
      });

      setUpload((current) => current ? { ...current, loaded: file.size, total: file.size, percent: 100, processing: true, error: "" } : current);
      setMessage("Upload complete. Generating media metadata and preview…");

      try {
        await processUploadedMedia(file, uploadedMedia);
        setUpload((current) => current ? { ...current, processing: false, error: "" } : current);
        setMessage("Upload complete. Metadata and preview are ready.");
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (error) {
        setUpload((current) => current ? { ...current, processing: false, error: error.message || "Preview generation failed." } : current);
        setMessage("Upload succeeded, but the media preview could not be generated. The original file is still available.");
      }
    } catch (error) {
      setUpload((current) => current ? { ...current, processing: false, error: error.message || "Upload failed." } : current);
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
          <button className="btn btn-cream" type="button" disabled={!selectedFile || Boolean(upload && (upload.processing || (upload.percent > 0 && upload.percent < 100 && !upload.error)))} onClick={() => void uploadSelectedFile()}>{upload && upload.percent < 100 && !upload.error ? "Uploading…" : upload?.processing ? "Processing…" : "Upload"}</button>
        </div>
        {selectedFile && <p className="media-library__file-meta"><strong>{selectedFile.name}</strong><span>{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB · {uploadKind(selectedFile) || "unsupported"}</span></p>}
        {upload && <div className="media-library__progress" role="status" aria-live="polite"><div className="media-library__progress-head"><span>{upload.name}</span><strong>{upload.processing ? "Preview…" : `${upload.percent}%`}</strong></div><progress max="100" value={upload.percent} /><div className="media-library__progress-foot"><span>{upload.error || (upload.processing ? "Reading metadata and generating thumbnail…" : upload.percent === 100 ? "Uploaded" : "Uploading…")}</span>{upload.percent < 100 && !upload.processing && !upload.error && <button className="btn btn-ghost" type="button" onClick={cancelUpload}>Cancel</button>}</div></div>}
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
          <div className="media-card__preview">{item.kind === "video" ? <video src={item.mediaUrl} poster={item.thumbnailUrl || undefined} muted playsInline preload="metadata" controls /> : item.kind === "image" ? <img src={item.thumbnailUrl || item.mediaUrl} alt="" /> : item.kind === "audio" ? <audio src={item.mediaUrl} controls preload="metadata" /> : <div className="media-card__placeholder">{item.kind}</div>}</div>
          <div className="media-card__body"><strong>{item.title}</strong><span>{item.provider || item.origin} · {item.kind}{item.width && item.height ? ` · ${item.width}×${item.height}` : ""}{item.durationSeconds ? ` · ${Number(item.durationSeconds).toFixed(1)}s` : ""}{item.sizeBytes ? ` · ${(item.sizeBytes / (1024 * 1024)).toFixed(1)} MB` : ""}</span><button className="btn btn-ghost" type="button" disabled={savingId === item.id} onClick={() => void removeMedia(item)}>{savingId === item.id ? "Removing…" : "Remove"}</button></div>
        </article>)}</div>
      </section>
    </main>
  </div>;
}
