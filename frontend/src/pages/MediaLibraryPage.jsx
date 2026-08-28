import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Header from "../components/Header";
import "../components/ui.css";
import "./MediaLibraryPage.css";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "video", label: "Video" },
  { value: "image", label: "Image" },
  { value: "audio", label: "Audio" },
];

export default function MediaLibraryPage() {
  const { id } = useParams();
  const [media, setMedia] = useState([]);
  const [query, setQuery] = useState("technology");
  const [filter, setFilter] = useState("all");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("loading");
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState("");

  const loadMedia = useCallback(async () => {
    setStatus("loading");
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
  if (status === "error") return <div className="hx-page"><Header /><main className="container media-library"><div className="media-library__state media-library__state--error"><strong>Media library couldn’t load.</strong><span>{message}</span><button className="btn btn-cream" onClick={() => void loadMedia()}>Retry</button></div></main></div>;

  return <div className="hx-page">
    <Header right={<Link to={`/editor/${id}`} className="btn btn-ghost">Back to editor</Link>} />
    <main className="container media-library">
      <header className="media-library__header">
        <div><p className="eyebrow">Project media</p><h1>Media Library</h1><p>Import reusable project media here. Storyboard and source records remain unchanged.</p></div>
        <span className="editor-save-state">{media.length} assets</span>
      </header>

      <section className="media-library__search-card">
        <div className="editor-section-title"><strong>External library</strong><span>Pexels video search</span></div>
        <form className="media-library__search" onSubmit={searchExternalMedia}>
          <input aria-label="Search external media" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search B-roll, e.g. AI lab" />
          <button className="btn btn-cream" type="submit" disabled={searching}>{searching ? "Searching…" : "Search"}</button>
        </form>
        {results.length > 0 && <div className="media-library__results">{results.map((result) => <article className="media-result" key={result.providerAssetId || result.videoUrl}>
          <div className="media-result__thumb"><video src={result.videoUrl} poster={result.thumbnailUrl || undefined} muted playsInline preload="metadata" /></div>
          <div className="media-result__body"><strong>{result.title || "Pexels video"}</strong><span>{result.width && result.height ? `${result.width}×${result.height}` : "Portrait-ready"}</span><small>{result.photographer ? `By ${result.photographer}` : "Pexels"}</small><button className="btn btn-ghost" type="button" disabled={savingId === (result.providerAssetId || result.videoUrl)} onClick={() => void importExternal(result)}>{savingId === (result.providerAssetId || result.videoUrl) ? "Adding…" : "Add to library"}</button></div>
        </article>)}</div>}
      </section>

      <section className="media-library__library-card">
        <div className="media-library__toolbar"><div className="media-library__filters">{FILTERS.map((item) => <button className={`btn btn-ghost ${filter === item.value ? "is-active" : ""}`} key={item.value} type="button" onClick={() => setFilter(item.value)}>{item.label}</button>)}</div><span>{visibleMedia.length} shown</span></div>
        {message && <p className="media-library__message" role="status">{message}</p>}
        {!visibleMedia.length && <div className="media-library__empty"><strong>No media yet.</strong><span>Search Pexels above to add reusable video assets. File uploads will be added in the upload pipeline.</span></div>}
        <div className="media-grid">{visibleMedia.map((item) => <article className="media-card" key={item.id}>
          <div className="media-card__preview">{item.kind === "video" ? <video src={item.mediaUrl} poster={item.thumbnailUrl || undefined} muted playsInline preload="metadata" /> : item.kind === "image" ? <img src={item.mediaUrl} alt="" /> : <div className="media-card__placeholder">{item.kind}</div>}</div>
          <div className="media-card__body"><strong>{item.title}</strong><span>{item.provider || item.origin} · {item.kind}</span><button className="btn btn-ghost" type="button" disabled={savingId === item.id} onClick={() => void removeMedia(item)}>{savingId === item.id ? "Removing…" : "Remove"}</button></div>
        </article>)}</div>
      </section>
    </main>
  </div>;
}
