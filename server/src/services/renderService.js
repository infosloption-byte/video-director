import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { prisma } from "../db/client.js";
import { getNarrationFilePath } from "./ttsService.js";

const RENDER_ROOT = path.resolve(process.cwd(), "storage", "renders");
const ENTRY_POINT = path.resolve(process.cwd(), "src", "remotion", "index.jsx");
const COMPOSITION_ID = "HelixReel";
let bundlePromise = null;

function getBaseUrl() {
  return String(process.env.REMOTION_BASE_URL || `http://127.0.0.1:${process.env.PORT || 4000}`).replace(/\/$/, "");
}

async function narrationIsAvailable(projectId, scene) {
  if (!scene.audioUrl) return false;
  try {
    await access(getNarrationFilePath(projectId, scene.id));
    return true;
  } catch {
    return false;
  }
}

function toRenderScene(scene) {
  const selectedAsset = scene.assets?.find((asset) => asset.isSelected) || scene.assets?.[0] || null;
  return {
    id: scene.id,
    sceneOrder: scene.sceneOrder,
    title: scene.title,
    spokenText: scene.spokenText,
    durationSeconds: Number(scene.durationSeconds || 1),
    wordTimestamps: scene.wordTimestamps || [],
    selectedAsset: selectedAsset ? { videoUrl: selectedAsset.videoUrl, thumbnailUrl: selectedAsset.thumbnailUrl } : null,
    audioUrl: scene.audioUrl ? `${getBaseUrl()}${scene.audioUrl}` : null,
  };
}

async function getBundle() {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: ENTRY_POINT,
      webpackOverride: (config) => config,
    }).catch((error) => {
      bundlePromise = null;
      throw error;
    });
  }
  return bundlePromise;
}

export async function renderProject(projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      scenes: {
        include: { assets: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sceneOrder: "asc" },
      },
    },
  });

  if (!project) throw new Error("Project not found.");
  if (!project.scenes.length) throw new Error("Generate the storyboard before rendering.");

  const missingNarration = [];
  for (const scene of project.scenes) {
    if (!scene.audioUrl || !(await narrationIsAvailable(project.id, scene))) missingNarration.push(scene.sceneOrder);
  }
  if (missingNarration.length) {
    throw new Error(`Narration is missing for scene${missingNarration.length > 1 ? "s" : ""} ${missingNarration.join(", ")}. Generate narration again before rendering.`);
  }

  const scenes = project.scenes.map(toRenderScene);
  const serveUrl = await getBundle();
  const inputProps = { scenes };
  const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps });

  const projectDir = path.join(RENDER_ROOT, projectId);
  await mkdir(projectDir, { recursive: true });
  const outputPath = path.join(projectDir, "reel.mp4");

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    audioCodec: "aac",
    outputLocation: outputPath,
    inputProps,
    chromiumOptions: { disableWebSecurity: true },
    onProgress: () => {},
  });

  const renderUrl = `/api/render-files/projects/${encodeURIComponent(projectId)}/reel.mp4`;
  await prisma.project.update({ where: { id: projectId }, data: { status: "finalize", renderUrl } });
  return { renderUrl, outputPath };
}
