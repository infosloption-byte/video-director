import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db/client.js";

const EXPORT_ROOT = path.resolve(process.cwd(), "storage", "exports");

function formatSrtTime(seconds) {
  const totalMs = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function buildSrt(scenes) {
  const blocks = [];
  let sceneOffset = 0;
  let subtitleIndex = 1;

  for (const scene of scenes) {
    const timestamps = Array.isArray(scene.wordTimestamps) ? scene.wordTimestamps : [];
    if (timestamps.length) {
      for (const item of timestamps) {
        const start = sceneOffset + Number(item.start || 0);
        const end = Math.max(start + 0.2, sceneOffset + Number(item.end || 0));
        blocks.push(`${subtitleIndex}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${String(item.word || "").trim()}\n`);
        subtitleIndex += 1;
      }
    } else {
      const duration = Number(scene.durationSeconds || 0);
      if (String(scene.spokenText || "").trim()) {
        blocks.push(`${subtitleIndex}\n${formatSrtTime(sceneOffset)} --> ${formatSrtTime(sceneOffset + duration)}\n${String(scene.spokenText).trim()}\n`);
        subtitleIndex += 1;
      }
    }
    sceneOffset += Number(scene.durationSeconds || 0);
  }

  return blocks.join("\n");
}

function buildScript(project, scenes) {
  const lines = [
    project.title || "Helix Reel",
    "",
    `Framework: ${project.selectedFramework || "—"}`,
    `Length: ${project.scriptLengthSeconds || Math.round(Number(project.durationSeconds || 0)) || "—"}s`,
    `Tone: ${project.tone || "—"}`,
    `Audience: ${project.audienceLevel || "—"}`,
    "",
    "SCRIPT",
    "",
  ];

  scenes.forEach((scene) => {
    lines.push(`${String(scene.sceneOrder).padStart(2, "0")}. ${scene.title || "Scene"}`);
    lines.push(String(scene.spokenText || "").trim());
    lines.push("");
  });

  return `${lines.join("\n").trim()}\n`;
}

function buildSeoCaption(project, scenes) {
  if (String(project.seoCaption || "").trim()) return String(project.seoCaption).trim();
  const keywords = new Set();
  String(project.title || "").split(/\s+/).filter(Boolean).forEach((word) => {
    const clean = word.replace(/[^\p{L}\p{N}-]/gu, "");
    if (clean.length >= 4) keywords.add(clean.toLowerCase());
  });
  scenes.slice(0, 2).forEach((scene) => {
    String(scene.spokenText || "").split(/\s+/).slice(0, 12).forEach((word) => {
      const clean = word.replace(/[^\p{L}\p{N}-]/gu, "");
      if (clean.length >= 6) keywords.add(clean.toLowerCase());
    });
  });
  const tags = [...keywords].slice(0, 8).map((word) => `#${word.replace(/[^a-z0-9-]/gi, "")}`).filter(Boolean);
  return `${project.title || "Science & tech explained"}. A concise, evidence-led breakdown of what changed, how it works, and why it matters.${tags.length ? `\n\n${tags.join(" ")}` : ""}`;
}

async function writeExport(projectId, kind, filename, content) {
  const projectDir = path.join(EXPORT_ROOT, projectId);
  await mkdir(projectDir, { recursive: true });
  const outputPath = path.join(projectDir, filename);
  await writeFile(outputPath, content, "utf8");
  return `/api/export-files/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(filename)}`;
}

async function recordExport(projectId, kind, fileUrl) {
  await prisma.projectExport.deleteMany({ where: { projectId, kind } });
  return prisma.projectExport.create({ data: { projectId, kind, fileUrl } });
}

export async function buildProjectExports(projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { scenes: { orderBy: { sceneOrder: "asc" } } },
  });
  if (!project) throw new Error("Project not found.");
  if (!project.scenes.length) throw new Error("Generate the storyboard before exporting.");

  const srtUrl = await writeExport(project.id, "srt", "captions.srt", buildSrt(project.scenes));
  const scriptTxtUrl = await writeExport(project.id, "script_txt", "script.txt", buildScript(project, project.scenes));
  await recordExport(project.id, "srt", srtUrl);
  await recordExport(project.id, "script_txt", scriptTxtUrl);

  const seoCaption = buildSeoCaption(project, project.scenes);
  await prisma.project.update({ where: { id: project.id }, data: { seoCaption } });

  let mp4Url = project.renderUrl || null;
  if (mp4Url) await recordExport(project.id, "mp4", mp4Url);
  else await prisma.projectExport.deleteMany({ where: { projectId: project.id, kind: "mp4" } });

  return { projectId: project.id, mp4Url, srtUrl, scriptTxtUrl, seoCaption };
}

export async function getProjectExportSummary(projectId) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, renderUrl: true, seoCaption: true } });
  if (!project) throw new Error("Project not found.");
  const exports = await prisma.projectExport.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
  return {
    projectId: project.id,
    mp4Url: project.renderUrl || exports.find((item) => item.kind === "mp4")?.fileUrl || null,
    srtUrl: exports.find((item) => item.kind === "srt")?.fileUrl || null,
    scriptTxtUrl: exports.find((item) => item.kind === "script_txt")?.fileUrl || null,
    seoCaption: project.seoCaption || "",
  };
}
