import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const RENDER_ASSET_ROOT = path.resolve(process.cwd(), "storage", "render-assets");
const DOWNLOAD_TIMEOUT_MS = 120000;

export function getRenderAssetPath(projectId, sceneId) {
  return path.join(RENDER_ASSET_ROOT, projectId, "scenes", `${sceneId}.mp4`);
}

export function getRenderAssetUrl(projectId, sceneId) {
  return `/api/render-assets/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}.mp4`;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureRenderAsset(projectId, scene) {
  const url = scene.assets?.find((asset) => asset.isSelected)?.videoUrl || scene.assets?.[0]?.videoUrl;
  if (!url) throw new Error(`Scene ${scene.sceneOrder} has no selected B-roll video.`);

  const target = getRenderAssetPath(projectId, scene.id);
  if (await fileExists(target)) return { path: target, url: getRenderAssetUrl(projectId, scene.id), downloaded: false };

  await mkdir(path.dirname(target), { recursive: true });
  const response = await fetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    headers: { Accept: "video/mp4,video/*;q=0.9,*/*;q=0.1" },
  });
  if (!response.ok) throw new Error(`Failed to download B-roll for scene ${scene.sceneOrder}: Pexels returned ${response.status}.`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error(`Downloaded B-roll for scene ${scene.sceneOrder} was empty.`);
  await writeFile(target, buffer);
  return { path: target, url: getRenderAssetUrl(projectId, scene.id), downloaded: true };
}

export async function ensureRenderAssets(projectId, scenes, onProgress = () => {}) {
  const results = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const result = await ensureRenderAsset(projectId, scenes[index]);
    results.push(result);
    onProgress(Math.min(20, 16 + Math.round(((index + 1) / scenes.length) * 4)));
  }
  return results;
}
