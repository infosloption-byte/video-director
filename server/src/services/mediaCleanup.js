import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db/client.js";
import { getMediaStorageRoot, mediaThumbnailStoragePaths } from "./mediaStorage.js";

const TEMP_FILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function normalizeKey(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

async function walkFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

async function removeEmptyDirectories(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const child = path.join(directory, entry.name);
    await removeEmptyDirectories(child);
    const remaining = await fs.readdir(child).catch(() => []);
    if (!remaining.length) await fs.rmdir(child).catch(() => {});
  }
}

export async function cleanupMediaStorage({ dryRun = false } = {}) {
  const root = getMediaStorageRoot();
  const records = await prisma.projectMedia.findMany({
    select: { id: true, projectId: true, origin: true, storageKey: true, thumbnailUrl: true },
  });

  const preserved = new Set();
  for (const record of records) {
    if (record.storageKey) preserved.add(normalizeKey(record.storageKey));
    if (record.origin === "upload" && record.thumbnailUrl) {
      preserved.add(normalizeKey(mediaThumbnailStoragePaths(record.projectId, record.id).storageKey));
    }
  }

  const files = await walkFiles(root);
  const now = Date.now();
  let removed = 0;
  let preservedCount = 0;
  const removedKeys = [];

  for (const filePath of files) {
    const relative = normalizeKey(path.relative(root, filePath));
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat) continue;

    const isTemporary = path.basename(filePath).startsWith(".uploading-");
    const isStaleTemporary = isTemporary && now - stat.mtimeMs >= TEMP_FILE_MAX_AGE_MS;
    if (preserved.has(relative) && !isStaleTemporary) {
      preservedCount += 1;
      continue;
    }

    if (!preserved.has(relative) || isStaleTemporary) {
      if (!dryRun) await fs.rm(filePath, { force: true });
      removed += 1;
      removedKeys.push(relative);
    }
  }

  if (!dryRun) await removeEmptyDirectories(root);

  return { root, scanned: files.length, preserved: preservedCount, removed, removedKeys, dryRun };
}
