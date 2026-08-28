import { prisma } from "../db/client.js";
import { getRequestUserId } from "./auth.js";

export async function requireProjectOwner(req, res, next) {
  if (!req.params.id) return next();
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id }, select: { id: true, userId: true } });
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (project.userId !== getRequestUserId(req)) return res.status(403).json({ error: "You do not have access to this project." });
    req.projectOwner = project;
    return next();
  } catch (error) {
    return next(error);
  }
}

export async function requireSceneOwner(req, res, next) {
  if (!req.params.sceneId) return next();
  try {
    const scene = await prisma.projectScene.findUnique({ where: { id: req.params.sceneId }, select: { projectId: true, project: { select: { userId: true } } } });
    if (!scene) return res.status(404).json({ error: "Scene not found." });
    if (scene.project.userId !== getRequestUserId(req)) return res.status(403).json({ error: "You do not have access to this scene." });
    return next();
  } catch (error) {
    return next(error);
  }
}
