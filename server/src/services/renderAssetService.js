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

function mb(bytes) {
  return `${(Number(bytes || 0) / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadToFile(url, target, onProgress) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    headers: { Accept: "video/mp4,video/*;q=0.9,*/*;q=0.1" },
  });
  if (!response.ok) throw new Error(`Pexels returned ${response.status}.`);
  if (!response.body) throw new Error("Pexels returned an empty download stream.");

  const totalBytes = Number(response.headers.get("content-length") || 0);
  let receivedBytes = 0;
  const chunks = [];
  const reader = response.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    chunks.push(chunk);
    receivedBytes += chunk.length;
    onProgress({
      receivedBytes,
      totalBytes,
      progress: totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 100) : null,
    });
  }

  const buffer = Buffer.concat(chunks);
  if (!buffer.length) throw new Error("Downloaded B-roll was empty.");
  await writeFile(target, buffer);
  return { receivedBytes, totalBytes: totalBytes || receivedBytes };
}

export async function ensureRenderAsset(projectId, scene, { sceneIndex = 0, sceneCount = 1, onProgress = () => {} } = {}) {
  const url = scene.assets?.find((asset) => asset.isSelected)?.videoUrl || scene.assets?.[0]?.videoUrl;
  if (!url) throw new Error(`Scene ${scene.sceneOrder} has no selected B-roll video.`);

  const target = getRenderAssetPath(projectId, scene.id);
  if (await fileExists(target)) {
    onProgress({
      sceneIndex,
      sceneCount,
      sceneOrder: scene.sceneOrder,
      phase: "cached",
      progress: 100,
      receivedBytes: 0,
      totalBytes: 0,
      message: `Scene ${scene.sceneOrder}: B-roll already cached`,
    });
    return { path: target, url: getRenderAssetUrl(projectId, scene.id), downloaded: false };
  }

  await mkdir(path.dirname(target), { recursive: true });
  onProgress({
    sceneIndex,
    sceneCount,
    sceneOrder: scene.sceneOrder,
    phase: "downloading",
    progress: 0,
    receivedBytes: 0,
    totalBytes: 0,
    message: `Scene ${scene.sceneOrder}: starting B-roll download`,
  });

  await downloadToFile(url, target, ({ receivedBytes, totalBytes, progress }) => {
    onProgress({
      sceneIndex,
      sceneCount,
      sceneOrder: scene.sceneOrder,
      phase: "downloading",
      progress,
      receivedBytes,
      totalBytes,
      message: progress == null
        ? `Scene ${scene.sceneOrder}: downloading ${mb(receivedBytes)}`
        : `Scene ${scene.sceneOrder}: downloading ${mb(receivedBytes)} / ${mb(totalBytes)}`,
    });
  });

  onProgress({
    sceneIndex,
    sceneCount,
    sceneOrder: scene.sceneOrder,
    phase: "downloaded",
    progress: 100,
    receivedBytes: 1,
    totalBytes: 1,
    message: `Scene ${scene.sceneOrder}: B-roll cached locally`,
  });
  return { path: target, url: getRenderAssetUrl(projectId, scene.id), downloaded: true };
}

export async function ensureRenderAssets(projectId, scenes, onProgress = () => {}) {
  const results = [];
  const sceneCount = scenes.length;
  for (let index = 0; index < sceneCount; index += 1) {
    const result = await ensureRenderAsset(projectId, scenes[index], {
      sceneIndex: index,
      sceneCount,
      onProgress: (detail) => {
        const perScene = 100 / Math.max(sceneCount, 1);
        const sceneFraction = detail.progress == null ? 0 : detail.progress / 100;
        const overall = Math.round((index + sceneFraction) * perScene);
        onProgress({
          ...detail,
          overallProgress: Math.max(0, Math.min(100, overall)),
          completedScenes: index + (detail.phase === "downloaded" || detail.phase === "cached" ? 1 : 0),
        });
      },
    });
    results.push(result);
  }
  onProgress({
    sceneIndex: sceneCount - 1,
    sceneCount,
    sceneOrder: sceneCount,
    phase: "complete",
    progress: 100,
    overallProgress: 100,
    completedScenes: sceneCount,
    receivedBytes: 0,
    totalBytes: 0,
    message: "All selected B-roll is cached locally",
  });
  return results;
}
