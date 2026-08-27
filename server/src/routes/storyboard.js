import { Router } from "express";
import { prisma } from "../db/client.js";
import { generateStoryboard } from "../services/storyboardService.js";
import { searchPexelsVideos } from "../services/pexelsService.js";
import { synthesizeSpeech } from "../services/ttsService.js";

const router = Router();

function publicScene(scene) {
  return {
    id: scene.id,
    sceneOrder: scene.sceneOrder,
    title: scene.title,
    spokenText: scene.spokenText,
    durationSeconds: scene.durationSeconds == null ? null : Number(scene.durationSeconds),
    whyLine: scene.whyLine,
    whyPicture: scene.whyPicture,
    brollSearchTerm: scene.brollSearchTerm,
    audioUrl: scene.audioUrl,
    wordTimestamps: scene.wordTimestamps || [],
    assets: (scene.assets || []).map((asset) => ({
      id: asset.id,
      videoUrl: asset.videoUrl,
      thumbnailUrl: asset.thumbnailUrl,
      sortOrder: asset.sortOrder,
      isSelected: asset.isSelected,
    })),
  };
}

async function loadProjectScenes(id) {
  return prisma.project.findUnique({
    where: { id },
    include: { scenes: { include: { assets: { orderBy: { sortOrder: "asc" } } }, orderBy: { sceneOrder: "asc" } } },
  });
}

router.get("/projects/:id/scenes", async (req, res) => {
  try {
    const project = await loadProjectScenes(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found." });
    res.json({ projectId: project.id, status: project.status, scenes: project.scenes.map(publicScene) });
  } catch (error) {
    console.error("GET /api/projects/:id/scenes failed:", error);
    res.status(500).json({ error: "Failed to load storyboard scenes." });
  }
});

router.post("/projects/:id/generate-scenes", async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id }, include: { signal: true } });
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (!project.researchSummary) return res.status(409).json({ error: "Complete research before generating scenes." });
    if (!project.scriptLengthSeconds || !project.selectedFramework || !project.tone || !project.audienceLevel) {
      return res.status(409).json({ error: "Complete guided setup before generating scenes." });
    }

    const scenes = await generateStoryboard({ project, signal: project.signal });
    const withAssets = await Promise.all(scenes.map(async (scene) => ({ scene, assets: await searchPexelsVideos(scene.broll_search_term, 5) })));
    const missingAssets = withAssets.find((item) => item.assets.length < 5);
    if (missingAssets) throw new Error(`Pexels returned fewer than 5 usable visuals for scene ${missingAssets.scene.scene_order}.`);

    await prisma.$transaction(async (tx) => {
      const existing = await tx.projectScene.findMany({ where: { projectId: project.id }, select: { id: true } });
      if (existing.length) await tx.sceneAsset.deleteMany({ where: { sceneId: { in: existing.map((item) => item.id) } } });
      await tx.projectScene.deleteMany({ where: { projectId: project.id } });

      for (const item of withAssets) {
        const createdScene = await tx.projectScene.create({
          data: {
            projectId: project.id,
            sceneOrder: item.scene.scene_order,
            title: item.scene.title,
            spokenText: item.scene.spoken_text,
            durationSeconds: item.scene.duration_seconds,
            whyLine: item.scene.why_line,
            whyPicture: item.scene.why_picture,
            brollSearchTerm: item.scene.broll_search_term,
          },
        });
        await tx.sceneAsset.createMany({
          data: item.assets.map((asset, index) => ({
            sceneId: createdScene.id,
            videoUrl: asset.videoUrl,
            thumbnailUrl: asset.thumbnailUrl,
            sortOrder: index,
            isSelected: index === 0,
          })),
        });
      }

      await tx.project.update({
        where: { id: project.id },
        data: {
          status: "storyboard",
          durationSeconds: withAssets.reduce((sum, item) => sum + Number(item.scene.duration_seconds || 0), 0),
          cuts: withAssets.length,
        },
      });
    });

    const result = await loadProjectScenes(project.id);
    res.status(201).json({ projectId: project.id, scenes: result.scenes.map(publicScene) });
  } catch (error) {
    console.error(`POST /api/projects/${req.params.id}/generate-scenes failed:`, error);
    res.status(500).json({ error: error.message || "Failed to generate storyboard." });
  }
});

router.post("/projects/:id/generate-voice", async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { scenes: { orderBy: { sceneOrder: "asc" } } },
    });
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (!project.scenes.length) return res.status(409).json({ error: "Generate the storyboard before generating narration." });

    const generated = [];
    for (const scene of project.scenes) {
      const narration = await synthesizeSpeech({
        projectId: project.id,
        sceneId: scene.id,
        text: scene.spokenText,
      });

      await prisma.projectScene.update({
        where: { id: scene.id },
        data: {
          audioUrl: narration.audioUrl,
          wordTimestamps: narration.wordTimestamps,
          ...(narration.durationSeconds != null ? { durationSeconds: narration.durationSeconds } : {}),
        },
      });
      generated.push({ sceneId: scene.id, ...narration });
    }

    const updatedProject = await loadProjectScenes(project.id);
    res.status(201).json({ projectId: project.id, scenes: updatedProject.scenes.map(publicScene), generatedCount: generated.length });
  } catch (error) {
    console.error(`POST /api/projects/${req.params.id}/generate-voice failed:`, error);
    res.status(500).json({ error: error.message || "Failed to generate narration." });
  }
});

router.patch("/scenes/:sceneId/select-asset", async (req, res) => {
  try {
    const { assetId } = req.body || {};
    if (!assetId) return res.status(400).json({ error: "assetId is required." });
    const asset = await prisma.sceneAsset.findUnique({ where: { id: assetId } });
    if (!asset || asset.sceneId !== req.params.sceneId) return res.status(404).json({ error: "Scene asset not found." });
    await prisma.$transaction([
      prisma.sceneAsset.updateMany({ where: { sceneId: asset.sceneId }, data: { isSelected: false } }),
      prisma.sceneAsset.update({ where: { id: asset.id }, data: { isSelected: true } }),
    ]);
    res.json({ assetId: asset.id, sceneId: asset.sceneId });
  } catch (error) {
    console.error("PATCH /api/scenes/:sceneId/select-asset failed:", error);
    res.status(500).json({ error: "Failed to select scene asset." });
  }
});

export default router;
