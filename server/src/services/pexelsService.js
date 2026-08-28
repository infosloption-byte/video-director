const PEXELS_ENDPOINT = "https://api.pexels.com/v1/videos/search";
const MAX_RESULTS = 5;

function pickVideoFile(video) {
  const mp4s = (video.video_files || []).filter((file) => file.file_type === "video/mp4" && file.link && Number(file.width) > 0 && Number(file.height) > 0);
  const portrait = mp4s.filter((file) => Number(file.height) >= Number(file.width));
  const candidates = portrait.length ? portrait : mp4s;
  return candidates.sort((a, b) => {
    const aWidth = Number(a.width || 0);
    const bWidth = Number(b.width || 0);
    const aTargetDistance = Math.abs(aWidth - 1080);
    const bTargetDistance = Math.abs(bWidth - 1080);
    if (aTargetDistance !== bTargetDistance) return aTargetDistance - bTargetDistance;
    return Number(a.height || 0) - Number(b.height || 0);
  })[0] || null;
}

export async function searchPexelsVideos(query, limit = MAX_RESULTS) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error("PEXELS_API_KEY is not configured.");
  const normalizedQuery = String(query || "technology").trim().replace(/\s+/g, " ").slice(0, 120);
  const params = new URLSearchParams({ query: normalizedQuery, orientation: "portrait", size: "medium", per_page: String(Math.min(Math.max(limit, 1), 80)) });
  const response = await fetch(`${PEXELS_ENDPOINT}?${params}`, {
    headers: { Authorization: apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Pexels returned ${response.status}.`);
  const data = await response.json();
  return (data.videos || []).map((video) => {
    const file = pickVideoFile(video);
    return file && video.image ? {
      providerAssetId: String(video.id),
      title: `Pexels video ${video.id}`,
      videoUrl: file.link,
      thumbnailUrl: video.image,
      sourceUrl: video.url,
      photographer: video.user?.name || null,
      width: Number(file.width) || null,
      height: Number(file.height) || null,
      durationSeconds: Number(video.duration) || null,
    } : null;
  }).filter(Boolean).slice(0, limit);
}
