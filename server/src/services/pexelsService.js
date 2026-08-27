const PEXELS_ENDPOINT = "https://api.pexels.com/v1/videos/search";
const MAX_RESULTS = 5;

function pickVideoFile(video) {
  const mp4s = (video.video_files || []).filter((file) => file.file_type === "video/mp4" && file.link);
  return mp4s.sort((a, b) => {
    const aPortrait = Number(a.height || 0) > Number(a.width || 0);
    const bPortrait = Number(b.height || 0) > Number(b.width || 0);
    if (aPortrait !== bPortrait) return aPortrait ? -1 : 1;
    return Number(b.height || 0) - Number(a.height || 0);
  })[0] || null;
}

export async function searchPexelsVideos(query, limit = MAX_RESULTS) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error("PEXELS_API_KEY is not configured.");
  const normalizedQuery = String(query || "technology").trim().replace(/\s+/g, " ").slice(0, 120);
  const params = new URLSearchParams({ query: normalizedQuery, orientation: "portrait", per_page: String(Math.min(Math.max(limit, 1), 80)) });
  const response = await fetch(`${PEXELS_ENDPOINT}?${params}`, {
    headers: { Authorization: apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Pexels returned ${response.status}.`);
  const data = await response.json();
  return (data.videos || []).map((video) => {
    const file = pickVideoFile(video);
    return file && video.image ? {
      videoUrl: file.link,
      thumbnailUrl: video.image,
      sourceUrl: video.url,
      photographer: video.user?.name || null,
    } : null;
  }).filter(Boolean).slice(0, limit);
}
