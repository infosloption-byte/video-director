import crypto from "node:crypto";
import { prisma } from "../db/client.js";
import { getRequestUserId } from "./auth.js";

function projectIdFromPath(req) {
  const parts = String(req.path || "").split("/").filter(Boolean);
  if (!parts.length) return null;
  if (parts[0] === "projects") return parts[1] || null;
  return parts[0] || null;
}

function configuredRenderToken() {
  return String(process.env.RENDER_ASSET_TOKEN || "").trim();
}

function safeTokenEqual(expected, provided) {
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(String(provided));
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export function isValidRenderAssetToken(req) {
  return safeTokenEqual(configuredRenderToken(), req.query?.renderToken);
}

export async function requireStoredProjectOwner(req, res, next) {
  try {
    const projectId = projectIdFromPath(req);
    if (!projectId) return res.status(404).json({ error: "Project media not found." });
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
    if (!project || project.userId !== getRequestUserId(req)) return res.status(404).json({ error: "Project media not found." });
    return next();
  } catch (error) {
    return next(error);
  }
}

export async function requireRenderAssetAccess(req, res, next) {
  if (isValidRenderAssetToken(req)) return next();
  return requireStoredProjectOwner(req, res, next);
}
