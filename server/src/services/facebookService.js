import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const DEFAULT_API_VERSION = "v25.0";
const RENDER_ROOT = path.resolve(process.cwd(), "storage", "renders");

function requireConfig() {
  const pageId = process.env.FACEBOOK_PAGE_ID?.trim();
  const pageAccessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  if (!pageId || !pageAccessToken) {
    throw new Error("Facebook publishing is not configured. Set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN in server/.env.");
  }
  return {
    pageId,
    pageAccessToken,
    apiVersion: process.env.FACEBOOK_API_VERSION?.trim() || DEFAULT_API_VERSION,
  };
}

function graphUrl(pathname, apiVersion) {
  return `https://graph.facebook.com/${apiVersion}/${pathname.replace(/^\//, "")}`;
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

async function graphRequest(url, { method = "GET", headers, body } = {}) {
  const response = await fetch(url, { method, headers, body });
  const payload = await readJson(response);
  if (!response.ok) {
    const message = payload?.error?.message || `Facebook Graph API returned HTTP ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function renderFilePath(projectId) {
  return path.join(RENDER_ROOT, projectId, "reel.mp4");
}

export async function publishFacebookReel({ project, title, description }) {
  const { pageId, pageAccessToken, apiVersion } = requireConfig();
  const duration = Number(project.durationSeconds || 0);
  if (!project.renderUrl) throw new Error("Render the final MP4 before publishing to Facebook.");
  if (duration < 4 || duration > 60) throw new Error(`Facebook Reels require a duration between 4 and 60 seconds. This reel is ${duration.toFixed(1)}s.`);

  const filePath = renderFilePath(project.id);
  const fileInfo = await stat(filePath).catch(() => null);
  if (!fileInfo?.isFile()) throw new Error("The final MP4 file is missing. Render the reel again before publishing.");

  const startUrl = new URL(graphUrl(`${encodeURIComponent(pageId)}/video_reels`, apiVersion));
  startUrl.searchParams.set("access_token", pageAccessToken);
  startUrl.searchParams.set("upload_phase", "start");
  const startPayload = await graphRequest(startUrl.toString(), { method: "POST" });
  const videoId = startPayload.video_id;
  const uploadUrl = startPayload.upload_url || `https://rupload.facebook.com/video-upload/${apiVersion}/${encodeURIComponent(videoId)}`;
  if (!videoId) throw new Error("Facebook did not return a Reel video ID.");

  const videoBytes = await readFile(filePath);
  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${pageAccessToken}`,
      offset: "0",
      file_size: String(fileInfo.size),
      "Content-Type": "application/octet-stream",
    },
    body: videoBytes,
  });
  const uploadPayload = await readJson(uploadResponse);
  if (!uploadResponse.ok) {
    throw new Error(uploadPayload?.error?.message || `Facebook video upload failed (HTTP ${uploadResponse.status}).`);
  }

  const finishUrl = new URL(graphUrl(`${encodeURIComponent(pageId)}/video_reels`, apiVersion));
  finishUrl.searchParams.set("access_token", pageAccessToken);
  finishUrl.searchParams.set("upload_phase", "finish");
  finishUrl.searchParams.set("video_id", videoId);
  finishUrl.searchParams.set("video_state", "PUBLISHED");
  if (String(title || project.title || "").trim()) finishUrl.searchParams.set("title", String(title || project.title).trim());
  if (String(description || "").trim()) finishUrl.searchParams.set("description", String(description).trim());

  const finishPayload = await graphRequest(finishUrl.toString(), { method: "POST" });
  return {
    videoId,
    published: finishPayload?.success === true || Boolean(finishPayload?.id),
    response: finishPayload,
  };
}
