import { spawn } from "node:child_process";
import path from "node:path";

function ffprobePath() {
  return String(process.env.FFPROBE_PATH || "").trim() || "ffprobe";
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) return resolve({ stdout, stderr });
      const detail = stderr.trim().split(/\r?\n/).slice(-5).join(" ");
      reject(new Error(`${path.basename(command)} failed${signal ? ` (${signal})` : ""}${detail ? `: ${detail}` : "."}`));
    });
  });
}

export async function probeRenderedMedia(filePath) {
  const { stdout } = await runCommand(ffprobePath(), [
    "-v", "error",
    "-show_entries", "stream=codec_type,width,height:format=duration",
    "-of", "json",
    filePath,
  ]);
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { throw new Error("ffprobe returned invalid render metadata."); }
  const duration = Number(parsed.format?.duration);
  const video = parsed.streams?.find((stream) => stream.codec_type === "video") || null;
  const audio = parsed.streams?.find((stream) => stream.codec_type === "audio") || null;
  if (!video || Number(video.width) !== 1080 || Number(video.height) !== 1920) {
    throw new Error("Rendered MP4 is not a valid 1080x1920 vertical video.");
  }
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Rendered MP4 has no valid duration.");
  return {
    durationSeconds: duration,
    width: Number(video.width),
    height: Number(video.height),
    hasAudio: Boolean(audio),
  };
}
