export function getBaseMediaUrl() {
  return String(process.env.REMOTION_BASE_URL || `http://127.0.0.1:${process.env.PORT || 4000}`).replace(/\/$/, "");
}

export function getRenderToken() {
  return String(process.env.RENDER_ASSET_TOKEN || "").trim();
}
