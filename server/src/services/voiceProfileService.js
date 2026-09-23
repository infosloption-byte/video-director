import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(process.cwd(), "storage", "voice-profiles");
const MAX_SAMPLES = 6;
const MIN_SAMPLES = 2;
const MAX_SAMPLE_BYTES = 8 * 1024 * 1024;

function extensionFor(mimeType = "", filename = "") {
  const mime = String(mimeType).toLowerCase();
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("wav")) return "wav";
  const ext = path.extname(String(filename)).replace(/^\./, "").toLowerCase();
  return ext && /^[a-z0-9]+$/.test(ext) ? ext : "webm";
}

export function getVoiceProfileSamplePath(storageKey) {
  return path.resolve(process.cwd(), "storage", storageKey);
}

export async function saveVoiceProfileSample({ profileId, sampleId, promptText, audio, mimeType, filename }) {
  if (audio.length > MAX_SAMPLE_BYTES) throw new Error("Each recording must be 8 MB or smaller.");
  const ext = extensionFor(mimeType, filename);
  const storageKey = "voice-profiles/" + profileId + "/samples/" + sampleId + "." + ext;
  const filePath = getVoiceProfileSamplePath(storageKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, audio);
  return { storageKey, filePath, promptText: String(promptText || "").trim() };
}

export async function voiceSampleExists(storageKey) {
  try { await access(getVoiceProfileSamplePath(storageKey)); return true; } catch { return false; }
}

export async function deleteVoiceProfileFiles(profileId) {
  await rm(path.join(ROOT, profileId), { recursive: true, force: true }).catch(() => {});
}

async function normalizeSample(inputPath, outputPath) {
  await execFileAsync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", inputPath,
    "-af", "highpass=f=70,lowpass=f=12000,afftdn=nr=6:nf=-28,loudnorm=I=-18:TP=-1.5:LRA=11",
    "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", outputPath,
  ]);
}

export async function buildCombinedReference(samples, profileId) {
  if (samples.length < MIN_SAMPLES) throw new Error("Record at least " + MIN_SAMPLES + " samples before creating the voice profile.");
  if (samples.length > MAX_SAMPLES) throw new Error("A voice profile supports up to " + MAX_SAMPLES + " recordings.");
  const profileDir = path.join(ROOT, profileId);
  const tempDir = path.join(profileDir, "work");
  await mkdir(tempDir, { recursive: true });
  const normalized = [];
  try {
    for (let i = 0; i < samples.length; i += 1) {
      const input = getVoiceProfileSamplePath(samples[i].storageKey);
      if (!(await voiceSampleExists(samples[i].storageKey))) throw new Error("Recording " + (i + 1) + " is missing from storage.");
      const out = path.join(tempDir, "sample-" + String(i).padStart(2, "0") + ".wav");
      await normalizeSample(input, out);
      normalized.push(out);
    }
    const concatPath = path.join(tempDir, "concat.txt");
    await writeFile(concatPath, normalized.map((file) => "file '" + file.replaceAll("'", "'\\''") + "'").join("\n") + "\n");
    const combinedPath = path.join(profileDir, "combined-reference.wav");
    await execFileAsync("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "concat", "-safe", "0", "-i", concatPath, "-c:a", "pcm_s16le", combinedPath,
    ]);
    return combinedPath;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export { MAX_SAMPLES, MIN_SAMPLES, MAX_SAMPLE_BYTES };
