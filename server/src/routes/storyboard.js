import { Router } from "express";
import { prisma } from "../db/client.js";
import { generateStoryboard } from "../services/storyboardService.js";
import { loadResearchCorpus } from "../services/researchCorpusService.js";
import { searchPexelsVideos } from "../services/pexelsService.js";
import { getTtsDiagnostics, synthesizeSpeech, narrationFileExists } from "../services/ttsService.js";
import { requireProjectOwner, requireSceneOwner } from "../middleware/ownership.js";
import { getPredefinedVoice } from "../services/predefinedVoiceService.js";
import { FRAMEWORKS, TONES, AUDIENCES } from "../services/setupService.js";
import { rewriteStoryboardScene } from "../services/storyboardService.js";

const router = Router();
router.use("/projects/:id", requireProjectOwner);
router.use("/scenes/:sceneId", requireSceneOwner);

function normalizeAudioUrl(audioUrl, projectId, sceneId) {
  if (!audioUrl) return null;
  const value = String(audioUrl);
  const legacy = `/api/audio/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}.mp3`;
  if (value === legacy || value.includes(`/api/audio/projects/${projectId}/scenes/`)) return `/api/audio/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}.mp3`;
  return value;
}
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
    customization: scene.customization || null,
    audioUrl: normalizeAudioUrl(scene.audioUrl, scene.projectId, scene.id),
    wordTimestamps: scene.wordTimestamps || [],
    assets: (scene.assets || []).map((asset) => ({
      id: asset.id,
      videoUrl: asset.videoUrl,
      thumbnailUrl: asset.thumbnailUrl,
      sortOrder: asset.sortOrder,
      isSelected: asset.isSelected
    }))
  };
}
async function loadProjectScenes(id) {
  return prisma.project.findUnique({ where: { id }, include: { scenes: { include: { assets: { orderBy: { sortOrder: "asc" } } }, orderBy: { sceneOrder: "asc" } } } });
}
function allowedFramework(value) {
  return FRAMEWORKS.some((item) => item.key === value);
}
function allowedTone(value) {
  return TONES.includes(value);
}
function allowedAudience(value) {
  return AUDIENCES.includes(value);
}
function normalizeCustomization(value) {
  return value && typeof value === "object" ? { ...value } : {};
}
async function loadOwnedScene(sceneId) {
  return prisma.projectScene.findUnique({
    where: { id: sceneId },
    include: { project: { include: { signal: true } }, assets: { orderBy: { sortOrder: "asc" } } },
  });
}
async function resolveNarrationVoice({ project, userId, voice }) {
  const requested = voice && typeof voice === "object" ? voice : null;
  const requestedSource = requested?.source;
  const requestedId = String(requested?.id || "").trim();

  if (requestedSource === "clone" && requestedId) {
    const profile = await prisma.voiceProfile.findFirst({
      where: { id: requestedId, userId, status: "ready" },
      select: { id: true, name: true, preferredEngine: true, ttsVoiceId: true, language: true },
    });
    if (!profile?.ttsVoiceId) throw new Error("The selected cloned voice is not ready for narration.");
    return {
      source: "clone",
      id: profile.id,
      name: profile.name,
      engine: profile.preferredEngine,
      voiceId: profile.ttsVoiceId,
      language: profile.language || project.language || "English",
    };
  }

  if (requestedSource === "preset" && requestedId) {
    const preset = getPredefinedVoice(requestedId);
    if (!preset) throw new Error("The selected predefined voice is not available.");
    return {
      source: "preset",
      id: preset.id,
      name: preset.name,
      engine: preset.engine,
      voice: preset.voice,
      language: preset.language || project.language || "English",
    };
  }

  if (project.voiceProfileId) {
    const profile = await prisma.voiceProfile.findFirst({
      where: { id: project.voiceProfileId, userId, status: "ready" },
      select: { id: true, name: true, preferredEngine: true, ttsVoiceId: true, language: true },
    });
    if (!profile?.ttsVoiceId) throw new Error("The project's cloned voice is not ready.");
    return {
      source: "clone",
      id: profile.id,
      name: profile.name,
      engine: profile.preferredEngine,
      voiceId: profile.ttsVoiceId,
      language: profile.language || project.language || "English",
    };
  }

  const preset = getPredefinedVoice(project.voicePresetId);
  if (!preset) throw new Error("The project's predefined voice is not available.");
  return {
    source: "preset",
    id: preset.id,
    name: preset.name,
    engine: preset.engine,
    voice: preset.voice,
    language: preset.language || project.language || "English",
  };
}
async function syncProjectStoryboardTotals(projectId) {
  const scenes = await prisma.projectScene.findMany({ where: { projectId }, select: { durationSeconds: true } });
  const totalDuration = scenes.reduce((sum, scene) => sum + Number(scene.durationSeconds || 0), 0);
  await prisma.project.update({
    where: { id: projectId },
    data: { durationSeconds: totalDuration, cuts: scenes.length, renderUrl: null, status: "storyboard" },
  });
  return { durationSeconds: totalDuration, cuts: scenes.length };
}

router.get("/tts/diagnostics", async (_req, res) => {
  try {
    res.json(await getTtsDiagnostics());
  } catch (error) {
    console.error("GET /api/tts/diagnostics failed:", error);
    res.status(500).json({ error: "Failed to inspect TTS providers.", detail: error.message });
  }
});

router.get("/projects/:id/scenes", async (req, res) => {
  try { const project = await loadProjectScenes(req.params.id); if (!project) return res.status(404).json({ error: "Project not found." }); res.json({ projectId: project.id, status: project.status, scenes: project.scenes.map((scene) => publicScene({ ...scene, projectId: project.id })) }); }
  catch (error) { console.error("GET /api/projects/:id/scenes failed:", error); res.status(500).json({ error: "Failed to load storyboard scenes." }); }
});

router.get("/projects/:id/research-corpus", async (req, res) => {
  try {
    const corpus = await loadResearchCorpus(req.params.id);
    if (!corpus) return res.status(404).json({ error: "Research corpus is not available yet." });
    res.json({ projectId: req.params.id, corpus });
  } catch (error) {
    console.error(`GET /api/projects/${req.params.id}/research-corpus failed:`, error);
    res.status(500).json({ error: "Failed to load the reusable research corpus." });
  }
});

router.post("/projects/:id/generate-scenes", async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id }, include: { signal: true } });
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (!project.researchSummary) return res.status(409).json({ error: "Complete research before generating scenes." });
    if (!project.scriptLengthSeconds || !project.selectedFramework || !project.tone || !project.audienceLevel) return res.status(409).json({ error: "Complete guided setup before generating scenes." });
    const voiceProfileId = project.voiceProfileId || null;
    const voicePresetId = project.voicePresetId || null;
    if ((voiceProfileId && voicePresetId) || (!voiceProfileId && !voicePresetId)) {
      return res.status(409).json({ error: "Select a narration voice in Setup before generating the storyboard." });
    }

    let narrationVoice;
    if (voiceProfileId) {
      const voiceProfile = await prisma.voiceProfile.findFirst({
        where: { id: voiceProfileId, userId: req.user.id, status: "ready" },
        select: { id: true, preferredEngine: true, ttsVoiceId: true, language: true },
      });
      if (!voiceProfile?.ttsVoiceId) return res.status(409).json({ error: "The selected cloned voice is not ready for narration." });
      narrationVoice = {
        source: "clone",
        id: voiceProfile.id,
        engine: voiceProfile.preferredEngine,
        voiceId: voiceProfile.ttsVoiceId,
        language: voiceProfile.language || project.language || "English",
      };
    } else {
      const preset = getPredefinedVoice(voicePresetId);
      if (!preset) return res.status(409).json({ error: "The selected predefined voice is not available." });
      narrationVoice = {
        source: "preset",
        id: preset.id,
        engine: preset.engine,
        voice: preset.voice,
        language: preset.language || project.language || "English",
      };
    }
    const researchCorpus = await loadResearchCorpus(project.id);
    if (!researchCorpus) return res.status(409).json({ error: "The persisted research corpus is not available. Complete research before generating scenes." });
    const scenes = await generateStoryboard({ project, signal: project.signal, researchCorpus });
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
            customization: {
              framework: project.selectedFramework,
              tone: project.tone,
              audienceLevel: project.audienceLevel,
              targetDurationSeconds: item.scene.duration_seconds,
              customized: false,
              voice: narrationVoice.source === "clone"
                ? { source: "clone", id: narrationVoice.id, engine: narrationVoice.engine, voiceId: narrationVoice.voiceId, language: narrationVoice.language }
                : { source: "preset", id: narrationVoice.id, engine: narrationVoice.engine, voice: narrationVoice.voice, language: narrationVoice.language },
            },
          },
        });
        await tx.sceneAsset.createMany({ data: item.assets.map((asset, index) => ({ sceneId: createdScene.id, videoUrl: asset.videoUrl, thumbnailUrl: asset.thumbnailUrl, sortOrder: index, isSelected: index === 0 })) });
      }
      await tx.project.update({ where: { id: project.id }, data: { status: "storyboard", durationSeconds: withAssets.reduce((sum, item) => sum + Number(item.scene.duration_seconds || 0), 0), cuts: withAssets.length } });
    });
    const result = await loadProjectScenes(project.id);
    for (const scene of result.scenes) {
      const narration = await synthesizeSpeech({
        projectId: project.id,
        sceneId: scene.id,
        text: scene.spokenText,
        engine: narrationVoice.engine,
        voiceId: narrationVoice.voiceId,
        voice: narrationVoice.voice,
        language: narrationVoice.language,
        allowFallback: false,
      });
      await prisma.projectScene.update({
        where: { id: scene.id },
        data: {
          audioUrl: narration.audioUrl,
          wordTimestamps: narration.wordTimestamps,
          ...(narration.durationSeconds != null ? { durationSeconds: narration.durationSeconds } : {}),
        },
      });
    }
    const narrated = await loadProjectScenes(project.id);
    const totalDuration = narrated.scenes.reduce((sum, scene) => sum + Number(scene.durationSeconds || 0), 0);
    await prisma.project.update({
      where: { id: project.id },
      data: {
        durationSeconds: totalDuration,
        cuts: narrated.scenes.length,
        voiceProfileId: narrationVoice.source === "clone" ? narrationVoice.id : null,
        voicePresetId: narrationVoice.source === "preset" ? narrationVoice.id : null,
      },
    });
    const finalProject = await loadProjectScenes(project.id);
    res.status(201).json({
      projectId: project.id,
      scenes: finalProject.scenes.map((scene) => publicScene({ ...scene, projectId: project.id })),
      narrationGenerated: true,
      narrationVoice: {
        source: narrationVoice.source,
        id: narrationVoice.id,
        engine: narrationVoice.engine,
        language: narrationVoice.language,
      },
    });
  } catch (error) { console.error(`POST /api/projects/${req.params.id}/generate-scenes failed:`, error); res.status(error?.status === 429 ? 429 : 500).json({ error: error.message || "Failed to generate storyboard." }); }
});

router.post("/projects/:id/generate-voice", async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { scenes: { orderBy: { sceneOrder: "asc" } } },
    });
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (!project.scenes.length) return res.status(409).json({ error: "Generate the storyboard before generating narration." });

    const { engine, voiceId, voiceProfileId, voicePresetId, language, instruct, speed, allowFallback } = req.body || {};
    let selectedEngine = engine;
    let selectedVoiceId = voiceId;
    let selectedVoice = null;
    let selectedVoiceProfileId = null;
    let selectedVoicePresetId = null;

    if (voiceProfileId) {
      const profile = await prisma.voiceProfile.findFirst({
        where: { id: String(voiceProfileId), userId: req.user.id, status: "ready" },
        select: { id: true, preferredEngine: true, ttsVoiceId: true, language: true },
      });
      if (!profile || !profile.ttsVoiceId) return res.status(404).json({ error: "Voice profile not found or not ready." });
      selectedEngine = profile.preferredEngine;
      selectedVoiceId = profile.ttsVoiceId;
      selectedVoiceProfileId = profile.id;
    } else if (voicePresetId) {
      const preset = getPredefinedVoice(voicePresetId);
      if (!preset) return res.status(404).json({ error: "Predefined voice not found." });
      selectedEngine = preset.engine;
      selectedVoiceId = null;
      selectedVoicePresetId = preset.id;
      selectedVoice = preset.voice;
    } else if (!selectedEngine || !selectedVoiceId) {
      if (project.voiceProfileId) {
        const profile = await prisma.voiceProfile.findFirst({
          where: { id: project.voiceProfileId, userId: req.user.id, status: "ready" },
          select: { id: true, preferredEngine: true, ttsVoiceId: true, language: true },
        });
        if (!profile || !profile.ttsVoiceId) return res.status(409).json({ error: "The project's cloned voice is not ready." });
        selectedEngine = profile.preferredEngine;
        selectedVoiceId = profile.ttsVoiceId;
        selectedVoiceProfileId = profile.id;
      } else if (project.voicePresetId) {
        const preset = getPredefinedVoice(project.voicePresetId);
        if (!preset) return res.status(409).json({ error: "The project's predefined voice is not available." });
        selectedEngine = preset.engine;
        selectedVoiceId = null;
        selectedVoice = preset.voice;
        selectedVoicePresetId = preset.id;
      } else {
        return res.status(409).json({ error: "Select a narration voice in Setup first." });
      }
    }

    const generated = [];
    for (const scene of project.scenes) {
      const narration = await synthesizeSpeech({
        projectId: project.id,
        sceneId: scene.id,
        text: scene.spokenText,
        engine: selectedEngine,
        voiceId: selectedVoiceId,
        voice: selectedVoice,
        language: language || "English",
        instruct,
        speed,
        allowFallback,
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
    const totalDuration = updatedProject.scenes.reduce((sum, scene) => sum + Number(scene.durationSeconds || 0), 0);
    await prisma.project.update({
      where: { id: project.id },
      data: {
        durationSeconds: totalDuration,
        cuts: updatedProject.scenes.length,
        voiceProfileId: selectedVoiceProfileId,
        voicePresetId: selectedVoicePresetId,
      },
    });
    const finalProject = await loadProjectScenes(project.id);
    res.status(201).json({
      projectId: project.id,
      durationSeconds: totalDuration,
      scenes: finalProject.scenes.map((scene) => publicScene({ ...scene, projectId: project.id })),
      generatedCount: generated.length,
      engine: generated[0]?.engine || null,
      fallback: Boolean(generated.some((item) => item.fallback)),
      voiceId: generated[0]?.voiceId || selectedVoiceId || null,
      voiceProfileId: selectedVoiceProfileId,
      voicePresetId: selectedVoicePresetId,
    });
  } catch (error) {
    console.error(`POST /api/projects/${req.params.id}/generate-voice failed:`, error);
    res.status(500).json({ error: error.message || "Failed to generate narration." });
  }
});

router.patch("/scenes/:sceneId/select-asset", async (req, res) => {
  try {
    const { assetId } = req.body || {};
    if (!assetId) return res.status(400).json({ error: "assetId is required." });
    const scene = await loadOwnedScene(req.params.sceneId);
    if (!scene) return res.status(404).json({ error: "Scene not found." });
    const asset = await prisma.sceneAsset.findUnique({ where: { id: assetId } });
    if (!asset || asset.sceneId !== scene.id) return res.status(404).json({ error: "Scene asset not found." });
    await prisma.$transaction([
      prisma.sceneAsset.updateMany({ where: { sceneId: scene.id }, data: { isSelected: false } }),
      prisma.sceneAsset.update({ where: { id: asset.id }, data: { isSelected: true } }),
      prisma.project.update({ where: { id: scene.projectId }, data: { renderUrl: null, status: "storyboard" } }),
    ]);
    const refreshed = await loadOwnedScene(scene.id);
    res.json({ scene: publicScene({ ...refreshed, projectId: scene.projectId }), assetId: asset.id, sceneId: asset.sceneId });
  } catch (error) {
    console.error("PATCH /api/scenes/:sceneId/select-asset failed:", error);
    res.status(500).json({ error: "Failed to select scene asset." });
  }
});

router.patch("/scenes/:sceneId/voice", async (req, res) => {
  try {
    const scene = await loadOwnedScene(req.params.sceneId);
    if (!scene) return res.status(404).json({ error: "Scene not found." });

    const voiceProfileId = String(req.body?.voiceProfileId || "").trim();
    const voicePresetId = String(req.body?.voicePresetId || "").trim();
    if ((voiceProfileId && voicePresetId) || (!voiceProfileId && !voicePresetId)) {
      return res.status(400).json({ error: "Choose either a cloned voice or a predefined voice." });
    }

    const voice = await resolveNarrationVoice({
      project: scene.project,
      userId: req.user.id,
      voice: voiceProfileId ? { source: "clone", id: voiceProfileId } : { source: "preset", id: voicePresetId },
    });

    const requestedText = typeof req.body?.text === "string"
      ? req.body.text.trim().slice(0, 5000)
      : scene.spokenText;
    if (!requestedText) return res.status(400).json({ error: "Narration text is required." });

    const narration = await synthesizeSpeech({
      projectId: scene.projectId,
      sceneId: scene.id,
      text: requestedText,
      engine: voice.engine,
      voiceId: voice.voiceId,
      voice: voice.voice,
      language: voice.language,
      allowFallback: false,
    });

    const customization = normalizeCustomization(scene.customization);
    customization.customized = true;
    customization.voice = voice.source === "clone"
      ? { source: "clone", id: voice.id, name: voice.name, engine: voice.engine, voiceId: voice.voiceId, language: voice.language }
      : { source: "preset", id: voice.id, name: voice.name, engine: voice.engine, voice: voice.voice, language: voice.language };

    await prisma.projectScene.update({
      where: { id: scene.id },
      data: {
        ...(requestedText !== scene.spokenText ? { spokenText: requestedText } : {}),
        audioUrl: narration.audioUrl,
        wordTimestamps: narration.wordTimestamps,
        ...(narration.durationSeconds != null ? { durationSeconds: narration.durationSeconds } : {}),
        customization,
      },
    });

    const totals = await syncProjectStoryboardTotals(scene.projectId);
    const refreshed = await loadOwnedScene(scene.id);
    res.json({ scene: publicScene({ ...refreshed, projectId: scene.projectId }), ...totals });
  } catch (error) {
    console.error(`PATCH /api/scenes/${req.params.sceneId}/voice failed:`, error);
    res.status(500).json({ error: error.message || "Failed to regenerate scene narration." });
  }
});

router.post("/scenes/:sceneId/rewrite", async (req, res) => {
  try {
    const scene = await loadOwnedScene(req.params.sceneId);
    if (!scene) return res.status(404).json({ error: "Scene not found." });

    const saved = normalizeCustomization(scene.customization);
    const framework = req.body?.framework || saved.framework || scene.project.selectedFramework || "how-it-works";
    const tone = req.body?.tone || saved.tone || scene.project.tone || "Conversational";
    const audienceLevel = req.body?.audienceLevel || saved.audienceLevel || scene.project.audienceLevel || "General public";
    const instruction = String(req.body?.instruction || "").trim().slice(0, 1000);
    const requestedDuration = Number(req.body?.targetDurationSeconds);
    const targetDurationSeconds = Number.isFinite(requestedDuration) && requestedDuration > 0
      ? Math.min(30, Math.max(1.5, requestedDuration))
      : Number(scene.durationSeconds || 5);

    if (!allowedFramework(framework)) return res.status(400).json({ error: "Invalid scene framework." });
    if (!allowedTone(tone)) return res.status(400).json({ error: "Invalid scene tone." });
    if (!allowedAudience(audienceLevel)) return res.status(400).json({ error: "Invalid scene audience." });

    const researchCorpus = await loadResearchCorpus(scene.projectId);
    if (!researchCorpus) return res.status(409).json({ error: "The persisted research corpus is not available." });

    const siblingScenes = await prisma.projectScene.findMany({
      where: { projectId: scene.projectId },
      orderBy: { sceneOrder: "asc" },
      select: { id: true, sceneOrder: true, title: true, spokenText: true, whyLine: true, brollSearchTerm: true },
    });

    const currentNarration = String(req.body?.currentNarration || scene.spokenText || "").trim().slice(0, 5000);
    const rewritten = await rewriteStoryboardScene({
      project: scene.project,
      signal: scene.project.signal,
      researchCorpus,
      scene,
      siblingScenes,
      overrides: { framework, tone, audienceLevel, targetDurationSeconds },
      instruction,
      currentNarration,
    });

    const requestedVoice = req.body?.voice && typeof req.body.voice === "object"
      ? {
          source: String(req.body.voice.source || "").trim(),
          id: String(req.body.voice.id || "").trim(),
        }
      : null;
    const voice = await resolveNarrationVoice({
      project: scene.project,
      userId: req.user.id,
      voice: requestedVoice?.source && requestedVoice?.id ? requestedVoice : saved.voice,
    });
    const narration = await synthesizeSpeech({
      projectId: scene.projectId,
      sceneId: scene.id,
      text: rewritten.spoken_text,
      engine: voice.engine,
      voiceId: voice.voiceId,
      voice: voice.voice,
      language: voice.language,
      allowFallback: false,
    });

    const refreshVisuals = req.body?.refreshVisuals !== false;
    const assets = refreshVisuals ? await searchPexelsVideos(rewritten.broll_search_term, 5) : scene.assets;
    if (refreshVisuals && assets.length < 5) {
      throw new Error("Pexels returned fewer than 5 usable visuals for this rewritten scene.");
    }

    const customization = { ...saved, customized: true, framework, tone, audienceLevel, targetDurationSeconds };
    customization.voice = voice.source === "clone"
      ? { source: "clone", id: voice.id, name: voice.name, engine: voice.engine, voiceId: voice.voiceId, language: voice.language }
      : { source: "preset", id: voice.id, name: voice.name, engine: voice.engine, voice: voice.voice, language: voice.language };

    await prisma.$transaction(async (tx) => {
      await tx.projectScene.update({
        where: { id: scene.id },
        data: {
          title: rewritten.title,
          spokenText: rewritten.spoken_text,
          durationSeconds: narration.durationSeconds != null ? narration.durationSeconds : rewritten.duration_seconds,
          whyLine: rewritten.why_line,
          whyPicture: rewritten.why_picture,
          brollSearchTerm: rewritten.broll_search_term,
          audioUrl: narration.audioUrl,
          wordTimestamps: narration.wordTimestamps,
          customization,
        },
      });

      if (refreshVisuals) {
        await tx.sceneAsset.deleteMany({ where: { sceneId: scene.id } });
        await tx.sceneAsset.createMany({
          data: assets.map((asset, index) => ({
            sceneId: scene.id,
            videoUrl: asset.videoUrl,
            thumbnailUrl: asset.thumbnailUrl,
            sortOrder: index,
            isSelected: index === 0,
          })),
        });
      }

      await tx.project.update({ where: { id: scene.projectId }, data: { renderUrl: null, status: "storyboard" } });
    });

    await syncProjectStoryboardTotals(scene.projectId);
    const refreshed = await loadOwnedScene(scene.id);
    res.json({ scene: publicScene({ ...refreshed, projectId: scene.projectId }), refreshedVisuals: refreshVisuals });
  } catch (error) {
    console.error(`POST /api/scenes/${req.params.sceneId}/rewrite failed:`, error);
    const status = [409, 429].includes(Number(error?.status)) ? Number(error.status) : 500;
    const message = error?.message || "Failed to rewrite this scene.";
    const retryMatch = message.match(/retry in ([0-9.]+)s/i);
    const retryAfterSeconds = Number.isFinite(Number(error?.retryAfterSeconds))
      ? Number(error.retryAfterSeconds)
      : (retryMatch ? Number(retryMatch[1]) : undefined);
    res.status(status).json({
      error: message,
      ...(status === 429 && Number.isFinite(retryAfterSeconds) ? { retryAfterSeconds } : {}),
    });
  }
});

router.post("/scenes/:sceneId/regenerate-assets", async (req, res) => {
  try {
    const scene = await loadOwnedScene(req.params.sceneId);
    if (!scene) return res.status(404).json({ error: "Scene not found." });

    const query = String(req.body?.query || scene.brollSearchTerm || scene.title || "technology")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 120);
    if (!query) return res.status(400).json({ error: "A visual search phrase is required." });

    const assets = await searchPexelsVideos(query, 5);
    if (assets.length < 5) throw new Error("Pexels returned fewer than 5 usable visuals for this scene.");

    await prisma.$transaction(async (tx) => {
      await tx.sceneAsset.deleteMany({ where: { sceneId: scene.id } });
      await tx.sceneAsset.createMany({
        data: assets.map((asset, index) => ({
          sceneId: scene.id,
          videoUrl: asset.videoUrl,
          thumbnailUrl: asset.thumbnailUrl,
          sortOrder: index,
          isSelected: index === 0,
        })),
      });
      await tx.projectScene.update({ where: { id: scene.id }, data: { brollSearchTerm: query } });
      await tx.project.update({ where: { id: scene.projectId }, data: { renderUrl: null, status: "storyboard" } });
    });

    const refreshed = await loadOwnedScene(scene.id);
    res.json({ scene: publicScene({ ...refreshed, projectId: scene.projectId }), query, assetCount: assets.length });
  } catch (error) {
    console.error(`POST /api/scenes/${req.params.sceneId}/regenerate-assets failed:`, error);
    res.status(500).json({ error: error.message || "Failed to regenerate scene visuals." });
  }
});

router.get("/projects/:id/narration-status", async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id }, include: { scenes: { orderBy: { sceneOrder: "asc" } } } });
    if (!project) return res.status(404).json({ error: "Project not found." });
    const scenes = await Promise.all(project.scenes.map(async (scene) => ({ sceneId: scene.id, ready: Boolean(scene.audioUrl && await narrationFileExists(project.id, scene.id) && Array.isArray(scene.wordTimestamps) && scene.wordTimestamps.length > 0) })));
    res.json({ projectId: project.id, ready: scenes.length > 0 && scenes.every((scene) => scene.ready), scenes });
  } catch (error) { console.error(`GET /api/projects/${req.params.id}/narration-status failed:`, error); res.status(500).json({ error: "Failed to inspect narration files." }); }
});

export default router;
