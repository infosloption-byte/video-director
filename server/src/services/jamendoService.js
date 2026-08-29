const JAMENDO_ENDPOINT = "https://api.jamendo.com/v3.0/tracks/";

function clean(value, max = 120) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

export async function searchJamendoTracks(query, limit = 12) {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) throw new Error("JAMENDO_CLIENT_ID is not configured.");

  const params = new URLSearchParams({
    client_id: clientId,
    format: "json",
    limit: String(Math.min(Math.max(Number(limit) || 12, 1), 30)),
    search: clean(query) || "instrumental",
    include: "musicinfo",
  });

  const response = await fetch(`${JAMENDO_ENDPOINT}?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Jamendo returned ${response.status}.`);

  const data = await response.json();
  if (Number(data?.headers?.code || 0) !== 0) throw new Error(data?.headers?.error_message || "Jamendo search failed.");

  return (data.results || []).map((track) => ({
    providerAssetId: String(track.id),
    title: clean(track.name || "Untitled track", 191),
    artist: clean(track.artist_name || "", 191) || null,
    audioUrl: track.audio || track.audiodownload || null,
    sourceUrl: track.shareurl || track.shorturl || null,
    thumbnailUrl: track.image || track.album_image || null,
    durationSeconds: Number(track.duration) || null,
    licenseUrl: track.license_ccurl || null,
    provider: "jamendo",
  })).filter((track) => track.audioUrl);
}
