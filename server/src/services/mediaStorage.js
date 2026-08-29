import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export function getMediaStorageRoot() {
  const configured = String(process.env.MEDIA_STORAGE_ROOT || "").trim();
  return path.resolve(configured || path.join(process.cwd(), "storage", "media"));
}

function safeSegment(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "");
}

export function mediaStoragePaths(projectId, extension) {
  const safeProjectId = safeSegment(projectId);
  const safeExtension = String(extension || "").toLowerCase().replace(/[^a-z0-9.]/g, "");
  const filename = `${crypto.randomUUID()}${safeExtension}`;
  const relativeDirectory = safeProjectId;
  const relativePath = path.posix.join(relativeDirectory, filename);
  const tempRelativePath = path.posix.join(relativeDirectory, `.uploading-${crypto.randomUUID()}${safeExtension}`);
  return {
    storageKey: relativePath,
    tempStorageKey: tempRelativePath,
    finalPath: resolveStorageKey(relativePath),
    tempPath: resolveStorageKey(tempRelativePath),
  };
}

export function mediaProxyStoragePaths(projectId, mediaId) {
  const safeProjectId = safeSegment(projectId);
  const safeMediaId = safeSegment(mediaId);
  const relativeDirectory = path.posix.join(safeProjectId, "proxies");
  const storageKey = path.posix.join(relativeDirectory, `${safeMediaId}.mp4`);
  const tempStorageKey = path.posix.join(relativeDirectory, `.processing-${safeMediaId}-${crypto.randomUUID()}.mp4`);
  return {
    storageKey,
    tempStorageKey,
    finalPath: resolveStorageKey(storageKey),
    tempPath: resolveStorageKey(tempStorageKey),
  };
}

export function mediaThumbnailStoragePaths(projectId, mediaId) {
  const safeProjectId = safeSegment(projectId);
  const safeMediaId = safeSegment(mediaId);
  const relativeDirectory = path.posix.join(safeProjectId, "thumbnails");
  const storageKey = path.posix.join(relativeDirectory, `${safeMediaId}.png`);
  const tempStorageKey = path.posix.join(relativeDirectory, `.uploading-${safeMediaId}-${crypto.randomUUID()}.png`);
  return {
    storageKey,
    tempStorageKey,
    finalPath: resolveStorageKey(storageKey),
    tempPath: resolveStorageKey(tempStorageKey),
  };
}

export function resolveStorageKey(storageKey) {
  const root = getMediaStorageRoot();
  const normalized = String(storageKey || "").replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error("Invalid media storage key.");
  }
  const resolved = path.resolve(root, normalized);
  const prefix = `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(prefix)) throw new Error("Invalid media storage key.");
  return resolved;
}

export async function ensureMediaStorageDirectory(projectId) {
  const root = resolveStorageKey(String(projectId));
  await fs.mkdir(root, { recursive: true });
  return root;
}

export async function removeMediaStorageFile(storageKey) {
  if (!storageKey) return;
  const filePath = resolveStorageKey(storageKey);
  await fs.rm(filePath, { force: true });
}

export async function moveMediaStorageFile(tempStorageKey, storageKey) {
  const tempPath = resolveStorageKey(tempStorageKey);
  const finalPath = resolveStorageKey(storageKey);
  await fs.mkdir(path.dirname(finalPath), { recursive: true });
  await fs.rename(tempPath, finalPath);
}
