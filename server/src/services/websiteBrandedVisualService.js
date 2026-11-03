// Branded, source-bound website marketing artwork. The output is a local
// PNG rendered by FFmpeg, not a generic stock clip or a third-party AI image.
// Remotion displays the still for the duration of the scene and animates its
// existing captions/audio above it. Site assets require rights review.
import crypto from "node:crypto";
import path from "node:path";
import { mkdir, writeFile, rm, rename } from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { prisma } from "../db/client.js";
import { fetchPublicWebsiteImage } from "./websiteSafeFetch.js";
import { createWebsiteBrandKit, normalizeBrandColor, planWebsiteSceneVisual } from "./websiteBrandKit.js";
import { refineWebsiteReport } from "./websiteReportQuality.js";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(process.cwd(), "storage", "render-assets");
function uuid(value) {
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(String(value))) {
    throw new Error("Invalid project or scene identifier for branded artwork.");
  }
  return String(value);
}
export function brandSceneImagePath(projectId, sceneId) {
  return path.join(ROOT, uuid(projectId), "scenes", uuid(sceneId) + ".png");
}
export function brandSceneImageUrl(projectId, sceneId, version = null) {
  const uri = "/api/render-assets/" + uuid(projectId) + "/scenes/" + uuid(sceneId) + ".png";
  return version == null ? uri : uri + "?v=" + encodeURIComponent(String(version));
}
export function isBrandStillUrl(url, projectId, sceneId) {
  return String(url || "").split("?")[0] === brandSceneImageUrl(projectId, sceneId);
}
function ffColor(color, otherwise) {
  return "0x" + (normalizeBrandColor(color) || otherwise).slice(1);
}
export async function resolveMarketingBrandKit(project, db = prisma) {
  const campaign = project?.researchSources?.websiteMarketing;
  if (!campaign) return null;
  if (campaign.brandKit?.version === 1 && Array.isArray(campaign.brandKit.assets)) return campaign.brandKit;
  let report = null;
  if (campaign.analysisUrl) {
    const match = await db.websiteAnalysis.findFirst({
      where: { userId: project.userId, url: campaign.analysisUrl, status: "completed" },
      orderBy: { createdAt: "desc" },
      select: { report: true },
    });
    if (match?.report) report = refineWebsiteReport(match.report);
  }
  return report?.brandKit || createWebsiteBrandKit({
    url: campaign.analysisUrl,
    name: campaign.brandName,
    pages: [],
  });
}
export async function createWebsiteBrandedVisual({
  project, sceneId, scene, sceneIndex = 0, sceneCount = 1, variant = 0,
  loadImage = fetchPublicWebsiteImage, runFfmpeg = execFileAsync,
  brandKit: providedKit = null,
}) {
  const campaign = project?.researchSources?.websiteMarketing;
  if (!campaign || project.signal?.category !== "WEBSITE_MARKETING") {
    throw new Error("Branded visual creation is only available for website marketing.");
  }
  const brandKit = providedKit || await resolveMarketingBrandKit(project);
  const plan = planWebsiteSceneVisual({ campaign, brandKit, scene, sceneIndex, sceneCount, variant });
  const output = brandSceneImagePath(project.id, sceneId);
  const directory = path.dirname(output);
  await mkdir(directory, { recursive: true });
  const identifier = crypto.randomUUID();
  const tempPrefix = path.join(directory, "." + identifier);
  const files = [];
  try {
    // Brand text, factual CTA and subtitles are rendered ONCE by Remotion.
    // The artwork must remain text-free to prevent doubled/overlapping labels.
    let imagePath = null;
    if (plan.sourceImageUrl) {
      try {
        const image = await loadImage(plan.sourceImageUrl, campaign.analysisUrl);
        imagePath = tempPrefix + "." + image.extension;
        await writeFile(imagePath, image.bytes);
        files.push(imagePath);
        // Size-limited files may still decode into huge bitmaps. Probe the
        // dimensions before asking FFmpeg to allocate a full-resolution frame.
        const probe = await execFileAsync("ffprobe", [
          "-v", "error", "-select_streams", "v:0",
          "-show_entries", "stream=width,height", "-of", "json", imagePath,
        ], { timeout: 8000, maxBuffer: 8192 });
        const frame = JSON.parse(probe.stdout).streams?.[0] || {};
        const width = Number(frame.width), height = Number(frame.height);
        if (!(width >= 160 && width <= 4096 && height >= 120 && height <= 4096 && width * height <= 12_000_000)) {
          throw new Error("Website image dimensions are outside supported bounds.");
        }
      } catch {
        // Public assets are optional and can be blocked or unsupported.
        // Stay brand-grounded by drawing a generated layout, NEVER Pexels.
        imagePath = null;
        plan.sourceImageUrl = null;
        plan.visualSource = "generated_branded_layout";
        plan.rightsReviewRequired = false;
      }
    }
    const palette = plan.palette;
    const background = ffColor(palette.background, "#14232E");
    const accent = ffColor(palette.accent, "#50D4B5");
    const filters = [
      "drawbox=x=0:y=0:w=720:h=11:color=" + accent + "@0.70:t=fill",
      "drawbox=x=52:y=184:w=616:h=680:color=white@0.045:t=fill",
      "drawbox=x=52:y=184:w=12:h=680:color=" + accent + "@0.40:t=fill",
    ];
    if (!imagePath) {
      // Clean, text-free abstract brand geometry; no pretend UI controls,
      // prices, fake dashboard metrics or second caption layer.
      const shift = (variant % 3) * 18;
      filters.push(
        "drawbox=x=112:y=" + (332+shift) + ":w=495:h=210:color=" + accent + "@0.18:t=fill",
        "drawbox=x=178:y=" + (585+shift) + ":w=372:h=52:color=white@0.11:t=fill",
        "drawbox=x=252:y=" + (682+shift) + ":w=238:h=34:color=" + accent + "@0.45:t=fill",
      );
    }
    const args = ["-hide_banner", "-loglevel", "error", "-max_alloc", "134217728", "-y",
      "-f", "lavfi", "-i", "color=c=" + background + ":s=720x1280:r=1"];
    let graph;
    if (imagePath) {
      args.push("-i", imagePath);
      const stage = filters.join(",");
      graph = "[0:v]" + stage + "[base];" +
        "[1:v]scale=590:465:force_original_aspect_ratio=decrease," +
        "pad=590:465:(ow-iw)/2:(oh-ih)/2:color=" + background + "[photo];" +
        "[base][photo]overlay=65:387:shortest=1[final]";
    } else graph = "[0:v]" + filters.join(",") + "[final]";
    args.push("-filter_complex", graph, "-map", "[final]", "-frames:v", "1",
      "-update", "1", "-compression_level", "4", tempPrefix + ".png");
    const tempImage = tempPrefix + ".png";
    files.push(tempImage);
    try {
      await runFfmpeg("ffmpeg", args, { timeout: 60000, maxBuffer: 1024 * 1024 });
    } catch (err) {
      if (!imagePath) throw new Error("Branded scene artwork could not be produced by FFmpeg.");
      // Image may be corrupt even with a valid signature; redraw without it.
      plan.sourceImageUrl = null;
      plan.visualSource = "generated_branded_layout";
      plan.rightsReviewRequired = false;
      const fallback = ["-hide_banner", "-loglevel", "error", "-max_alloc", "134217728", "-y",
        "-f", "lavfi", "-i", "color=c=" + background + ":s=720x1280:r=1",
        "-filter_complex", "[0:v]" + filters.join(",") + "[final]",
          "-map", "[final]", "-frames:v", "1", "-update", "1",
          "-compression_level", "4", tempImage];
      await runFfmpeg("ffmpeg", fallback, { timeout: 60000, maxBuffer: 1024 * 1024 });
    }
    await rename(tempImage, output);
    const url = brandSceneImageUrl(project.id, sceneId, Date.now());
    return {
      videoUrl: url,
      thumbnailUrl: url,
      visualPlan: plan,
      assetCount: 1,
    };
  } finally {
    await Promise.allSettled(files.map(file => rm(file, { force: true })));
  }
}
