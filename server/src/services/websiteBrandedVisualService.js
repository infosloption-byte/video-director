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
const FONT = "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf";
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
function safeWords(value, max = 120) {
  return String(value || "").replace(/[\x00-\x1f\x7f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function wrap(value, width = 25, maxLines = 4) {
  const words = safeWords(value, width * maxLines * 2).split(/\s+/);
  const result = [];
  let line = "";
  for (const original of words) {
    const word = original.slice(0, width);
    if (line && (line + " " + word).length > width) {
      result.push(line);
      line = word;
    } else line = line ? line + " " + word : word;
    if (result.length >= maxLines) break;
  }
  if (result.length < maxLines && line) result.push(line);
  return result.slice(0, maxLines).join("\n");
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
  const labels = [
    safeWords(plan.brandName, 55),
    wrap(scene.title || campaign.focus || "Product overview", 25, 3),
    wrap(campaign.focus || scene.title || "Website product", 27, 2),
    wrap(campaign.cta || "Learn more on our website", 33, 2),
    (plan.scenePurpose === "hook" ? "INTRODUCING" : plan.scenePurpose === "cta" ? "DISCOVER MORE" : "PRODUCT HIGHLIGHT"),
  ];
  try {
    const texts = [];
    for (let i = 0; i < labels.length; i += 1) {
      const file = tempPrefix + "-text-" + i + ".txt";
      await writeFile(file, labels[i] || " ", "utf8");
      files.push(file);
      texts.push(file);
    }
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
        plan.sourceImageUrl = null;
        plan.visualSource = "generated_branded_layout";
        plan.rightsReviewRequired = false;
      }
    }
    const palette = plan.palette;
    const background = ffColor(palette.background, "#14232E");
    const accent = ffColor(palette.accent, "#50D4B5");
    const font = (file, size, x, y, color = "white") =>
      "drawtext=fontfile=" + FONT + ":textfile=" + file +
      ":fontsize=" + size + ":fontcolor=" + color + ":x=" + x +
      ":y=" + y + ":line_spacing=12:expansion=none";
    let filters = [
      "drawbox=x=0:y=0:w=720:h=14:color=" + accent + ":t=fill",
      "drawbox=x=44:y=310:w=632:h=625:color=white@0.07:t=fill",
      "drawbox=x=44:y=1015:w=632:h=150:color=" + accent + "@0.19:t=fill",
      font(texts[0], 36, 52, 68),
      font(texts[4], 19, 52, 132, accent),
      font(texts[1], 32, 52, 181),
    ];
    if (!imagePath) {
      // Distinct intentional SaaS visual geometry, not a fake dashboard.
      const shift = (variant % 3) * 24;
      filters.push(
        "drawbox=x=85:y=" + (415 + shift) + ":w=550:h=88:color=white@0.13:t=fill",
        "drawbox=x=110:y=" + (443 + shift) + ":w=260:h=16:color=" + accent + ":t=fill",
        "drawbox=x=85:y=" + (548 + shift) + ":w=550:h=100:color=white@0.09:t=fill",
        "drawbox=x=110:y=" + (577 + shift) + ":w=425:h=14:color=white@0.60:t=fill",
        "drawbox=x=85:y=" + (688 + shift) + ":w=550:h=100:color=white@0.09:t=fill",
        "drawbox=x=110:y=" + (719 + shift) + ":w=340:h=14:color=" + accent + "@0.75:t=fill",
        font(texts[2], 27, 91, 854),
      );
    }
    filters.push(font(texts[3], 25, 76, 1062));
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
