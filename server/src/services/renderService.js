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

function roundProgress(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0) * 10) / 10));
}

function getBaseUrl() {
  return String(process.env.REMOTION_BASE_URL || `http://127.0.0.1:${process.env.PORT || 4000}`).replace(/\/$/, "");
}

function getRenderAssetToken() {
  return String(process.env.RENDER_ASSET_TOKEN || "").trim();
}

function appendRenderToken(url) {
  const token = getRenderAssetToken();
  if (!token) throw new Error("RENDER_ASSET_TOKEN is required for server-side Remotion asset access.");
  const separator = String(url).includes("?") ? "&" : "?";
  return `${url}${separator}renderToken=${encodeURIComponent(token)}`;
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

  // A setup length is a planning target, not permission to time-stretch finished
  // narration. Previous renders became unnaturally fast because a 60s/15s target
  // was converted into a playbackRate > 1 for the entire reel. Keep the recorded
  // narration at natural speed and let the actual audio determine the final runtime.
  return {
    sourceTotal,
    targetDuration: target > 0 ? target : sourceTotal,
    scale: 1,
    targetExceeded: target > 0 && sourceTotal > target,
  };
}

function toRenderScene(scene, localAssetUrl = null) {
  const selectedAsset = scene.assets?.find((asset) => asset.isSelected) || scene.assets?.[0] || null;
  const sourceDuration = Number(scene.durationSeconds || 1);
  const audioPath = scene.audioUrl ? `${getBaseUrl()}${normalizeAudioUrl(scene.audioUrl)}` : null;
  return {
    id: scene.id,
    sceneOrder: scene.sceneOrder,
    title: scene.title,
    spokenText: scene.spokenText,
    durationSeconds: Math.max(0.25, sourceDuration),
    sourceDurationSeconds: sourceDuration,
    playbackRate: 1,
    timestampScale: 1,
    wordTimestamps: scene.wordTimestamps || [],
    selectedAsset: selectedAsset ? {
      videoUrl: localAssetUrl || selectedAsset.videoUrl,
      thumbnailUrl: selectedAsset.thumbnailUrl,
    } : null,
    audioUrl: audioPath ? appendRenderToken(audioPath) : null,
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
        progress: roundProgress(overallProgress),
        stage,
        stageProgress: roundProgress(stageProgress),
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
  if (!getRenderAssetToken()) throw new Error("RENDER_ASSET_TOKEN is not configured. Add it to server/.env before rendering.");

  report("preflight", 10, "Validating narration and render settings", 5);
  const missingNarration = [];
  for (const scene of project.scenes) {
    if (!scene.audioUrl || !(await narrationIsAvailable(project.id, scene))) missingNarration.push(scene.sceneOrder);
  }
  if (missingNarration.length) {
    throw new Error(`Narration is missing for scene${missingNarration.length > 1 ? "s" : ""} ${missingNarration.join(", ")}. Generate narration again before rendering.`);
  }

  const durationPlan = buildDurationPlan(project);
  const durationMessage = durationPlan.targetExceeded
    ? `Keeping narration at natural speed (${durationPlan.sourceTotal.toFixed(1)}s); selected ${durationPlan.targetDuration.toFixed(1)}s is a planning target`
    : "Narration is within the selected duration";
  report("preflight", 100, durationMessage, 8, {
    substeps: [
      { id: "narration", label: "Validate narration files", progress: 100 },
      { id: "duration", label: durationPlan.targetExceeded ? "Preserve natural narration timing" : "Confirm duration target", progress: 100 },
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
        { id: "select", label: "Select B-roll", progress: 100 },
        { id: "download", label: phaseLabel, progress: detail.progress == null ? 0 : detail.progress },
        { id: "cache", label: "Cache local asset", progress: detail.phase === "downloaded" || detail.phase === "cached" ? 100 : 0 },
      ],
    });
  });
  const localAssetUrlByScene = new Map(project.scenes.map((scene, index) => [scene.id, `${getBaseUrl()}${renderAssets[index].url}`]));

  const scenes = project.scenes.map((scene) => toRenderScene(scene, localAssetUrlByScene.get(scene.id)));
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

  report("rendering", 0, `Rendering ${effectiveDuration.toFixed(1)}s of video`, 28, {
    substeps: [
      { id: "frames", label: "Render video frames", progress: 0, state: "rendering", detail: "Starting frame rendering…" },
      { id: "encode", label: "Encode H.264 video", progress: 0, state: "encoding", detail: "Waiting for rendered frames…" },
      { id: "audio", label: "Mix narration audio", progress: 0, state: "waiting", detail: "Waiting for final audio/video muxing" },
      { id: "captions", label: "Render synchronized captions", progress: 0, state: "tracking", detail: "Progress follows frame rendering; captions are rendered inside each frame" },
    ],
  });

  const totalFrames = Number(composition.durationInFrames || 0);
  let lastRenderReportAt = 0;
  let lastStitchStage = null;

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    audioCodec: "aac",
    outputLocation: outputPath,
    inputProps,
    chromiumOptions: { disableWebSecurity: true },
    onProgress: ({
      progress = 0,
      renderedFrames = 0,
      encodedFrames = 0,
      renderedDoneIn = null,
      encodedDoneIn = null,
      renderEstimatedTime = 0,
      stitchStage = "encoding",
    }) => {
      const overallProgress = roundProgress(Number(progress) * 100);
      const frameProgress = renderedDoneIn !== null
        ? 100
        : totalFrames > 0
          ? roundProgress((Number(renderedFrames) / totalFrames) * 100)
          : 0;
      const encodeProgress = encodedDoneIn !== null
        ? 100
        : totalFrames > 0
          ? roundProgress((Number(encodedFrames) / totalFrames) * 100)
          : 0;
      const audioState = overallProgress >= 100
        ? "complete"
        : stitchStage === "muxing"
          ? "muxing"
          : "waiting";

      const now = Date.now();
      const stitchStageChanged = stitchStage !== lastStitchStage;
      if (
        overallProgress < 100 &&
        !stitchStageChanged &&
        now - lastRenderReportAt < 250
      ) {
        return;
      }

      lastRenderReportAt = now;
      lastStitchStage = stitchStage;

      const stageMessage = stitchStage === "muxing"
        ? "Mixing narration audio · muxing final MP4"
        : `Rendering frames · ${frameProgress}% · encoding video · ${encodeProgress}%`;

      report("rendering", overallProgress, stageMessage, 28 + (Number(progress) * 70), {
        totalFrames,
        renderedFrames: Number(renderedFrames),
        encodedFrames: Number(encodedFrames),
        renderedDoneIn: renderedDoneIn === null ? null : Number(renderedDoneIn),
        encodedDoneIn: encodedDoneIn === null ? null : Number(encodedDoneIn),
        renderEstimatedTimeMs: Number(renderEstimatedTime || 0),
        stitchStage,
        substeps: [
          {
            id: "frames",
            label: "Render video frames",
            progress: frameProgress,
            state: renderedDoneIn !== null ? "complete" : "rendering",
            detail: totalFrames > 0
              ? `${Math.min(Number(renderedFrames), totalFrames).toLocaleString()} / ${totalFrames.toLocaleString()} frames rendered`
              : "Rendering frames",
          },
          {
            id: "encode",
            label: "Encode H.264 video",
            progress: encodeProgress,
            state: encodedDoneIn !== null ? "complete" : "encoding",
            detail: totalFrames > 0
              ? `${Math.min(Number(encodedFrames), totalFrames).toLocaleString()} / ${totalFrames.toLocaleString()} frames encoded`
              : "Encoding video",
          },
          {
            id: "audio",
            label: "Mix narration audio",
            progress: audioState === "complete" ? 100 : 0,
            state: audioState,
            detail: audioState === "muxing"
              ? "Muxing narration audio into the final MP4"
              : audioState === "complete"
                ? "Narration mix complete"
                : "Waiting for final audio/video muxing",
          },
          {
            id: "captions",
            label: "Render synchronized captions",
            progress: frameProgress,
            state: renderedDoneIn !== null ? "complete" : "tracking",
            detail: "Progress follows frame rendering; captions are rendered inside each frame",
          },
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
  const renderUrl = `/api/render-files/${encodeURIComponent(projectId)}/reel.mp4`;
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
