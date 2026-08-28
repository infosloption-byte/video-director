import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { prisma } from "../db/client.js";
import { getNarrationFilePath } from "./ttsService.js";
import { ensureRenderAssets } from "./renderAssetService.js";

const RENDER_ROOT = path.resolve(process.cwd(), "storage", "renders");
const ENTRY_POINT = path.resolve(process.cwd(), "src", "remotion", "index.jsx");
const COMPOSITION_ID = "HelixReel";
let bundlePromise = null;

function getBaseUrl() {
  return String(process.env.REMOTION_BASE_URL || `http://127.0.0.1:${process.env.PORT || 4000}`).replace(/\/$/, "");
}

function normalizeAudioUrl(audioUrl) {
  if (!audioUrl) return null;
  return String(audioUrl).replace(/^\/api\/audio\/projects\//, "/api/audio/");
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

function buildDurationPlan(project) {
  const sourceTotal = project.scenes.reduce((sum, scene) => sum + Number(scene.durationSeconds || 0), 0);
  const target = Number(project.scriptLengthSeconds || 0);
  const scale = target > 0 && sourceTotal > target ? target / sourceTotal : 1;
  return {
    sourceTotal,
    targetDuration: scale < 1 ? target : sourceTotal,
    scale,
  };
}

function toRenderScene(scene, localAssetUrl = null, scale = 1) {
  const selectedAsset = scene.assets?.find((asset) => asset.isSelected) || scene.assets?.[0] || null;
  const sourceDuration = Number(scene.durationSeconds || 1);
  const durationSeconds = Math.max(0.25, sourceDuration * scale);
  const playbackRate = scale < 1 ? 1 / scale : 1;
  return {
    id: scene.id,
    sceneOrder: scene.sceneOrder,
    title: scene.title,
    spokenText: scene.spokenText,
    durationSeconds,
    sourceDurationSeconds: sourceDuration,
    playbackRate,
    timestampScale: scale,
    wordTimestamps: scene.wordTimestamps || [],
    selectedAsset: selectedAsset ? {
      videoUrl: localAssetUrl || selectedAsset.videoUrl,
      thumbnailUrl: selectedAsset.thumbnailUrl,
    } : null,
    audioUrl: scene.audioUrl ? `${getBaseUrl()}${normalizeAudioUrl(scene.audioUrl)}` : null,
  };
}

async function getBundle() {
  if (!bundlePromise) {
    bundlePromise = bundle({ entryPoint: ENTRY_POINT, webpackOverride: (config) => config }).catch((error) => {
      bundlePromise = null;
      throw error;
    });
  }
  return bundlePromise;
}

export async function renderProject(projectId, { onProgress } = {}) {
  const report = (stage, stageProgress, message, overallProgress, detail = {}) => {
    if (typeof onProgress === "function") {
      void onProgress({
        progress: Math.max(0, Math.min(100, Math.round(overallProgress))),
        stage,
        stageProgress: Math.max(0, Math.min(100, Math.round(stageProgress))),
        message,
        ...detail,
      });
    }
  };

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

  report("preflight", 10, "Validating narration and render settings", 5);
  const missingNarration = [];
  for (const scene of project.scenes) {
    if (!scene.audioUrl || !(await narrationIsAvailable(project.id, scene))) missingNarration.push(scene.sceneOrder);
  }
  if (missingNarration.length) {
    throw new Error(`Narration is missing for scene${missingNarration.length > 1 ? "s" : ""} ${missingNarration.join(", ")}. Generate narration again before rendering.`);
  }

  const durationPlan = buildDurationPlan(project);
  const durationMessage = durationPlan.scale < 1
    ? `Fitting ${durationPlan.sourceTotal.toFixed(1)}s narration into the ${durationPlan.targetDuration.toFixed(1)}s target`
    : "Narration is within the selected duration";
  report("preflight", 100, durationMessage, 8, {
    substeps: [
      { id: "narration", label: "Validate narration files", progress: 100 },
      { id: "duration", label: "Apply duration target", progress: 100 },
      { id: "settings", label: "Validate render settings", progress: 100 },
    ],
  });

  report("assets", 0, "Preparing selected B-roll", 9, {
    substeps: [],
    asset: null,
    completedAssets: 0,
    totalAssets: project.scenes.length,
  });
  const renderAssets = await ensureRenderAssets(project.id, project.scenes, (detail) => {
    const overallAsset = Number(detail.overallProgress || 0);
    const stageProgress = Math.max(0, Math.min(100, overallAsset));
    const phaseLabel = detail.phase === "cached" ? "Using cached B-roll" : detail.phase === "downloaded" ? "B-roll cached locally" : "Downloading B-roll";
    report("assets", stageProgress, detail.message || phaseLabel, 9 + (stageProgress * 11) / 100, {
      asset: {
        sceneIndex: detail.sceneIndex,
        sceneOrder: detail.sceneOrder,
        label: `Scene ${detail.sceneOrder}`,
        phase: detail.phase,
        progress: detail.progress,
        receivedBytes: detail.receivedBytes,
        totalBytes: detail.totalBytes,
      },
      completedAssets: detail.completedScenes || 0,
      totalAssets: detail.sceneCount,
      substeps: [
        {
          id: "select",
          label: "Select B-roll",
          progress: 100,
        },
        {
          id: "download",
          label: phaseLabel,
          progress: detail.progress == null ? 0 : detail.progress,
        },
        {
          id: "cache",
          label: detail.phase === "downloaded" || detail.phase === "cached" ? "Cache local asset" : "Cache local asset",
          progress: detail.phase === "downloaded" || detail.phase === "cached" ? 100 : 0,
        },
      ],
    });
  });
  const localAssetUrlByScene = new Map(project.scenes.map((scene, index) => [scene.id, `${getBaseUrl()}${renderAssets[index].url}`]));

  const scenes = project.scenes.map((scene) => toRenderScene(scene, localAssetUrlByScene.get(scene.id), durationPlan.scale));
  const effectiveDuration = scenes.reduce((sum, scene) => sum + Number(scene.durationSeconds || 0), 0);
  await prisma.project.update({
    where: { id: project.id },
    data: { durationSeconds: effectiveDuration, cuts: scenes.length },
  });

  report("bundle", 10, "Bundling the Helix composition", 21, {
    substeps: [
      { id: "resolve", label: "Resolve composition entry", progress: 100 },
      { id: "bundle", label: "Build Remotion bundle", progress: 10 },
    ],
  });
  const serveUrl = await getBundle();
  report("bundle", 100, "Composition bundle ready", 24, {
    substeps: [
      { id: "resolve", label: "Resolve composition entry", progress: 100 },
      { id: "bundle", label: "Build Remotion bundle", progress: 100 },
    ],
  });

  const inputProps = { scenes };
  report("composition", 35, "Selecting the 9:16 composition", 26, {
    substeps: [
      { id: "composition", label: "Load HelixReel composition", progress: 35 },
      { id: "timeline", label: `Build ${scenes.length}-scene timeline`, progress: 0 },
    ],
  });
  const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps });
  report("composition", 100, "Composition ready", 28, {
    substeps: [
      { id: "composition", label: "Load HelixReel composition", progress: 100 },
      { id: "timeline", label: `Build ${scenes.length}-scene timeline`, progress: 100 },
    ],
  });

  const projectDir = path.join(RENDER_ROOT, projectId);
  await mkdir(projectDir, { recursive: true });
  const outputPath = path.join(projectDir, "reel.mp4");

  report("rendering", 0, `Encoding ${effectiveDuration.toFixed(1)}s of video`, 28, {
    substeps: [
      { id: "frames", label: "Render video frames", progress: 0 },
      { id: "audio", label: "Mix narration audio", progress: 0 },
      { id: "captions", label: "Render synchronized captions", progress: 0 },
      { id: "encode", label: "Encode H.264 / AAC", progress: 0 },
    ],
  });
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    audioCodec: "aac",
    outputLocation: outputPath,
    inputProps,
    chromiumOptions: { disableWebSecurity: true },
    onProgress: ({ overallProgress = 0 }) => {
      const stageProgress = Number(overallProgress) * 100;
      report("rendering", stageProgress, `Encoding video · ${Math.round(stageProgress)}%`, 28 + Number(overallProgress) * 70, {
        substeps: [
          { id: "frames", label: "Render video frames", progress: stageProgress },
          { id: "audio", label: "Mix narration audio", progress: stageProgress },
          { id: "captions", label: "Render synchronized captions", progress: stageProgress },
          { id: "encode", label: "Encode H.264 / AAC", progress: stageProgress },
        ],
      });
    },
  });

  report("finalizing", 40, "Writing final MP4 and saving render state", 98, {
    substeps: [
      { id: "write", label: "Write MP4 file", progress: 40 },
      { id: "verify", label: "Verify output", progress: 0 },
      { id: "persist", label: "Save render state", progress: 0 },
    ],
  });
  const renderUrl = `/api/render-files/projects/${encodeURIComponent(projectId)}/reel.mp4`;
  await access(outputPath);
  report("finalizing", 75, "MP4 written successfully", 99, {
    substeps: [
      { id: "write", label: "Write MP4 file", progress: 100 },
      { id: "verify", label: "Verify output", progress: 100 },
      { id: "persist", label: "Save render state", progress: 20 },
    ],
  });
  await prisma.project.update({ where: { id: project.id }, data: { status: "finalize", renderUrl, durationSeconds: effectiveDuration } });
  report("finalizing", 100, "Render complete", 100, {
    substeps: [
      { id: "write", label: "Write MP4 file", progress: 100 },
      { id: "verify", label: "Verify output", progress: 100 },
      { id: "persist", label: "Save render state", progress: 100 },
    ],
  });
  return { renderUrl, outputPath, durationSeconds: effectiveDuration };
}
