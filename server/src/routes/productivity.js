import { Router } from "express";
import crypto from "node:crypto";
import { prisma } from "../db/client.js";

const router = Router();

function token() { return crypto.randomBytes(24).toString("hex"); }
function jsonClone(value) { return JSON.parse(JSON.stringify(value)); }

async function projectOr404(projectId, userId) {
  return prisma.project.findFirst({ where: { id: projectId, userId }, include: { editor: true, scenes: { orderBy: { sceneOrder: "asc" }, include: { assets: { orderBy: { sortOrder: "asc" } } } } } });
}

async function logActivity(projectId, userId, action, metadata = {}) {
  await prisma.projectActivity.create({ data: { projectId, userId, action, metadata } }).catch(() => {});
}

function applyTemplateToProject(template, project) {
  const templateTimeline = jsonClone(template.timeline || {});
  const targetScenes = project.scenes || [];
  const sceneIds = new Set(targetScenes.map((scene) => String(scene.id)));
  const assetsById = new Map();
  for (const scene of targetScenes) for (const asset of scene.assets || []) assetsById.set(String(asset.id), { scene, asset });
  const targetScenesByIndex = targetScenes;

  let videoIndex = 0;
  let narrationIndex = 0;
  let captionIndex = 0;
  const tracks = (templateTimeline.tracks || []).map((track) => {
    const clips = (track.clips || []).map((clip) => {
      const next = jsonClone(clip);
      if (track.kind === "video" || next.type === "video") {
        const targetScene = sceneIds.has(String(next.sourceId))
          ? targetScenes.find((scene) => String(scene.id) === String(next.sourceId))
          : targetScenesByIndex[videoIndex];
        videoIndex += 1;
        if (!targetScene) return null;
        const compatibleAsset = assetsById.get(String(next.assetId));
        const targetAsset = compatibleAsset?.scene?.id === targetScene.id
          ? compatibleAsset.asset
          : (targetScene.assets || []).find((asset) => asset.isSelected) || targetScene.assets?.[0] || null;
        next.sourceId = targetScene.id;
        next.assetId = targetAsset?.id || null;
        next.src = targetAsset?.videoUrl || null;
        next.thumbnailUrl = targetAsset?.thumbnailUrl || null;
        next.title = next.title || targetScene.title || `Scene ${targetScene.sceneOrder}`;
      } else if (track.id === "narration" || next.type === "audio") {
        const targetScene = sceneIds.has(String(next.sourceId))
          ? targetScenes.find((scene) => String(scene.id) === String(next.sourceId))
          : targetScenesByIndex[narrationIndex];
        narrationIndex += 1;
        if (track.id === "narration" && targetScene) {
          next.sourceId = targetScene.id;
          next.src = targetScene.audioUrl || null;
        }
      } else if (track.kind === "caption" || next.type === "caption") {
        const targetScene = sceneIds.has(String(next.sourceId))
          ? targetScenes.find((scene) => String(scene.id) === String(next.sourceId))
          : targetScenesByIndex[captionIndex];
        captionIndex += 1;
        if (targetScene) next.sourceId = targetScene.id;
      }
      return next;
    }).filter(Boolean);
    return { ...track, clips };
  });

  const duration = tracks.flatMap((track) => track.clips || []).reduce((max, clip) => Math.max(max, Number(clip.start || 0) + Number(clip.duration || 0)), 0);
  return { ...templateTimeline, schemaVersion: 1, fps: Number(templateTimeline.fps || 30), width: 1080, height: 1920, duration: Number(duration.toFixed(3)), tracks };
}

router.get("/:id/versions", async (req, res) => {
  const project = await projectOr404(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: "Project not found." });
  const versions = await prisma.projectVersion.findMany({ where: { projectId: project.id }, orderBy: { versionNumber: "desc" }, take: 100 });
  res.json({ versions });
});

router.post("/:id/versions", async (req, res) => {
  const project = await projectOr404(req.params.id, req.user.id);
  if (!project || !project.editor) return res.status(404).json({ error: "Project editor not found." });
  const latest = await prisma.projectVersion.findFirst({ where: { projectId: project.id }, orderBy: { versionNumber: "desc" } });
  const version = await prisma.projectVersion.create({ data: {
    projectId: project.id,
    versionNumber: (latest?.versionNumber || 0) + 1,
    label: String(req.body?.label || `Snapshot ${new Date().toLocaleString()}`).slice(0, 120),
    timeline: jsonClone(project.editor.timeline),
    createdById: req.user.id,
  } });
  await logActivity(project.id, req.user.id, "version.created", { versionId: version.id, versionNumber: version.versionNumber });
  res.status(201).json({ version });
});

router.post("/:id/restore/:versionId", async (req, res) => {
  const project = await projectOr404(req.params.id, req.user.id);
  if (!project || !project.editor) return res.status(404).json({ error: "Project editor not found." });
  const version = await prisma.projectVersion.findFirst({ where: { id: req.params.versionId, projectId: project.id } });
  if (!version) return res.status(404).json({ error: "Version not found." });
  const expectedVersion = Number(req.body?.version);
  if (!Number.isInteger(expectedVersion) || expectedVersion !== project.editor.version) return res.status(409).json({ error: "Editor changed elsewhere. Reload before restoring this version.", version: project.editor.version });
  const editor = await prisma.projectEditor.update({ where: { projectId: project.id }, data: { version: { increment: 1 }, timeline: jsonClone(version.timeline) } });
  await logActivity(project.id, req.user.id, "version.restored", { versionId: version.id, versionNumber: version.versionNumber });
  res.json({ editor, restoredVersion: version.versionNumber });
});

router.post("/:id/duplicate", async (req, res) => {
  const source = await projectOr404(req.params.id, req.user.id);
  if (!source) return res.status(404).json({ error: "Project not found." });
  const duplicate = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({ data: {
      userId: req.user.id, signalId: source.signalId, title: String(req.body?.title || `${source.title || "Project"} copy`).slice(0, 255),
      researchSummary: source.researchSummary, researchSources: source.researchSources, monetizationFlags: source.monetizationFlags,
      scriptLengthSeconds: source.scriptLengthSeconds, suggestedLengthSeconds: source.suggestedLengthSeconds, selectedFramework: source.selectedFramework,
      frameworkReasoning: source.frameworkReasoning, suggestedFramework: source.suggestedFramework, tone: source.tone, suggestedTone: source.suggestedTone,
      audienceLevel: source.audienceLevel, seoCaption: source.seoCaption, durationSeconds: source.durationSeconds, cuts: source.cuts, status: source.status,
    } });
    const sceneMap = new Map(); const assetMap = new Map();
    for (const scene of source.scenes) {
      const copiedScene = await tx.projectScene.create({ data: { projectId: project.id, sceneOrder: scene.sceneOrder, title: scene.title, spokenText: scene.spokenText, durationSeconds: scene.durationSeconds, whyLine: scene.whyLine, whyPicture: scene.whyPicture, brollSearchTerm: scene.brollSearchTerm, audioUrl: scene.audioUrl, wordTimestamps: scene.wordTimestamps } });
      sceneMap.set(scene.id, copiedScene.id);
      for (const asset of scene.assets) { const copiedAsset = await tx.sceneAsset.create({ data: { sceneId: copiedScene.id, videoUrl: asset.videoUrl, thumbnailUrl: asset.thumbnailUrl, sortOrder: asset.sortOrder, isSelected: asset.isSelected } }); assetMap.set(asset.id, copiedAsset.id); }
    }
    if (source.editor) {
      const timeline = jsonClone(source.editor.timeline);
      for (const track of timeline.tracks || []) for (const clip of track.clips || []) { if (clip.sourceId && sceneMap.has(clip.sourceId)) clip.sourceId = sceneMap.get(clip.sourceId); if (clip.assetId && assetMap.has(clip.assetId)) clip.assetId = assetMap.get(clip.assetId); }
      await tx.projectEditor.create({ data: { projectId: project.id, version: 1, timeline } });
    }
    return project;
  });
  await logActivity(duplicate.id, req.user.id, "project.duplicated", { sourceProjectId: source.id });
  res.status(201).json({ project: { id: duplicate.id, title: duplicate.title } });
});

router.get("/templates", async (req, res) => {
  const templates = await prisma.projectTemplate.findMany({ where: { userId: req.user.id }, orderBy: { updatedAt: "desc" }, take: 100 });
  res.json({ templates });
});

router.post("/templates", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Template name is required." });
  const template = await prisma.projectTemplate.create({ data: { userId: req.user.id, name: name.slice(0, 120), description: String(req.body?.description || "").slice(0, 500), timeline: req.body?.timeline || {} } });
  res.status(201).json({ template });
});

router.delete("/templates/:templateId", async (req, res) => {
  const template = await prisma.projectTemplate.findFirst({ where: { id: req.params.templateId, userId: req.user.id } });
  if (!template) return res.status(404).json({ error: "Template not found." });
  await prisma.projectTemplate.delete({ where: { id: template.id } });
  res.status(204).end();
});

router.post("/:id/template", async (req, res) => {
  const project = await projectOr404(req.params.id, req.user.id);
  if (!project?.editor) return res.status(404).json({ error: "Project editor not found." });
  const name = String(req.body?.name || project.title || "Editor template").trim();
  const template = await prisma.projectTemplate.create({ data: { userId: req.user.id, name: name.slice(0, 120), description: String(req.body?.description || "").slice(0, 500), timeline: jsonClone(project.editor.timeline) } });
  await logActivity(project.id, req.user.id, "template.created", { templateId: template.id });
  res.status(201).json({ template });
});

router.post("/:id/apply-template/:templateId", async (req, res) => {
  const project = await projectOr404(req.params.id, req.user.id);
  if (!project?.editor) return res.status(404).json({ error: "Project editor not found." });
  const template = await prisma.projectTemplate.findFirst({ where: { id: req.params.templateId, userId: req.user.id } });
  if (!template) return res.status(404).json({ error: "Template not found." });
  const expectedVersion = Number(req.body?.version);
  if (!Number.isInteger(expectedVersion) || expectedVersion !== project.editor.version) return res.status(409).json({ error: "Editor changed elsewhere. Reload before applying this template.", version: project.editor.version });
  const timeline = applyTemplateToProject(template, project);
  const editor = await prisma.projectEditor.update({ where: { projectId: project.id }, data: { version: { increment: 1 }, timeline } });
  await logActivity(project.id, req.user.id, "template.applied", { templateId: template.id });
  res.json({ editor, template: { id: template.id, name: template.name } });
});

router.get("/:id/review-links", async (req, res) => {
  const project = await projectOr404(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: "Project not found." });
  const reviews = await prisma.projectReviewLink.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, take: 100, include: { _count: { select: { comments: true } } } });
  res.json({ reviews });
});

router.post("/:id/review-links", async (req, res) => {
  const project = await projectOr404(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: "Project not found." });
  const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return res.status(400).json({ error: "Invalid review-link expiry." });
  const review = await prisma.projectReviewLink.create({ data: { projectId: project.id, token: token(), expiresAt } });
  await logActivity(project.id, req.user.id, "review_link.created", { reviewLinkId: review.id });
  res.status(201).json({ review });
});

router.get("/review/:token", async (req, res) => {
  const review = await prisma.projectReviewLink.findUnique({ where: { token: req.params.token }, include: { project: { select: { id: true, title: true, durationSeconds: true, renderUrl: true, editor: { select: { version: true, timeline: true, updatedAt: true, renderUrl: true, renderVersion: true } } } }, comments: { orderBy: { createdAt: "asc" } } } });
  if (!review || review.revokedAt || (review.expiresAt && review.expiresAt < new Date())) return res.status(404).json({ error: "Review link is unavailable." });
  res.json({ review: { id: review.id, project: review.project, expiresAt: review.expiresAt, comments: review.comments } });
});

router.post("/review/:token/comments", async (req, res) => {
  const review = await prisma.projectReviewLink.findUnique({ where: { token: req.params.token } });
  if (!review || review.revokedAt || (review.expiresAt && review.expiresAt < new Date())) return res.status(404).json({ error: "Review link is unavailable." });
  const body = String(req.body?.body || "").trim();
  if (!body) return res.status(400).json({ error: "Comment cannot be empty." });
  const comment = await prisma.projectReviewComment.create({ data: { reviewLinkId: review.id, authorName: String(req.body?.authorName || "Reviewer").slice(0, 120), body: body.slice(0, 2000) } });
  await logActivity(review.projectId, null, "review.comment.created", { commentId: comment.id });
  res.status(201).json({ comment });
});

router.patch("/review/:token/comments/:commentId", async (req, res) => {
  const review = await prisma.projectReviewLink.findUnique({ where: { token: req.params.token } });
  if (!review || review.revokedAt || (review.expiresAt && review.expiresAt < new Date())) return res.status(404).json({ error: "Review link is unavailable." });
  const comment = await prisma.projectReviewComment.findFirst({ where: { id: req.params.commentId, reviewLinkId: review.id } });
  if (!comment) return res.status(404).json({ error: "Comment not found." });
  const updated = await prisma.projectReviewComment.update({ where: { id: comment.id }, data: { resolved: req.body?.resolved == null ? comment.resolved : Boolean(req.body.resolved) } });
  res.json({ comment: updated });
});

router.delete("/:id/review-links/:reviewId", async (req, res) => {
  const project = await projectOr404(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: "Project not found." });
  const review = await prisma.projectReviewLink.findFirst({ where: { id: req.params.reviewId, projectId: project.id } });
  if (!review) return res.status(404).json({ error: "Review link not found." });
  await prisma.projectReviewLink.update({ where: { id: review.id }, data: { revokedAt: new Date() } });
  await logActivity(project.id, req.user.id, "review_link.revoked", { reviewLinkId: review.id });
  res.status(204).end();
});

router.get("/:id/activity", async (req, res) => {
  const project = await projectOr404(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: "Project not found." });
  const activity = await prisma.projectActivity.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ activity });
});

export default router;
