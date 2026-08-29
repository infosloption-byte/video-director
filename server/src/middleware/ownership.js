import { prisma } from "../db/client.js";
import { getRequestUserId } from "./auth.js";

function getProjectId(req) {
  if (req.params?.id) return String(req.params.id);
  if (req.params?.projectId) return String(req.params.projectId);

  // Routers mounted at /api/projects receive /:id/... after the mount point.
  // Routers mounted at /api receive /projects/:id/....
  const path = String(req.path || req.originalUrl || "").split("?")[0];
  const parts = path.split("/").filter(Boolean);
  const projectsIndex = parts.indexOf("projects");
  if (projectsIndex >= 0 && parts[projectsIndex + 1]) return parts[projectsIndex + 1];
  if (parts[0] && parts[0] !== "projects") return parts[0];
  return null;
}

export async function requireProjectOwner(req, res, next) {
  const projectId = getProjectId(req);
  if (!projectId) return next();
  try {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, userId: true } });
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
