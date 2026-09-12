import { access, mkdir, writeFile, rm, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { checkQwen3TtsHealth, synthesizeWithQwen, isQwen3TtsEnabled } from "./qwenTtsService.js";

const execFileAsync = promisify(execFile);
const AUDIO_ROOT = path.resolve(process.cwd(), "storage", "audio");
const DEFAULT_MODEL = "eleven_multilingual_v2";

function requireConfig() {
  return {
    apiKey: process.env.ELEVENLABS_API_KEY?.trim() || null,
    voiceId: process.env.ELEVENLABS_VOICE_ID?.trim() || null,
    modelId: process.env.ELEVENLABS_MODEL || DEFAULT_MODEL,
    ffmpegPath: process.env.FFMPEG_PATH?.trim() || "ffmpeg",
  };
}

async function findAvailableVoice(apiKey) {
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured.");

  const response = await fetch("https://api.elevenlabs.io/v1/voices?voice_type=non-community&page_size=100", {
    headers: { "xi-api-key": apiKey, Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`Unable to list ElevenLabs voices (HTTP ${response.status}).`);
    error.providerStatus = response.status;
    throw error;
  }

  const voices = Array.isArray(payload.voices) ? payload.voices : [];
  const eligible = voices.find((voice) => {
    const tiers = Array.isArray(voice.available_for_tiers)
      ? voice.available_for_tiers.map((tier) => String(tier).toLowerCase())
      : [];
    return voice.voice_id && (tiers.includes("free") || voice.sharing?.free_users_allowed === true || voice.is_legacy === true);
  });

  if (!eligible?.voice_id) {
    throw new Error("No ElevenLabs voice available to this account. Set ELEVENLABS_VOICE_ID to a voice shown in your ElevenLabs My Voices, or upgrade your ElevenLabs plan.");
  }
  return eligible.voice_id;
}

function isRestrictedLibraryVoiceError(message) {
  const text = String(message || "").toLowerCase();
  return text.includes("free users") && (text.includes("library voice") || text.includes("voice library"));
}

async function requestSpeech({ apiKey, voiceId, modelId, text }) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ text, model_id: modelId, output_format: "mp3_44100_128" }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.detail?.message || payload?.detail || `ElevenLabs returned HTTP ${response.status}.`;
    const error = new Error(String(detail));
    error.providerStatus = response.status;
    throw error;
  }
  return payload;
}

function buildWordTimestamps(alignment) {
  if (!alignment?.characters?.length) return [];
  const words = [];
  let word = "";
  let start = null;
  let end = null;

  alignment.characters.forEach((character, index) => {
    const characterStart = Number(alignment.character_start_times_seconds?.[index] ?? 0);
    const characterEnd = Number(alignment.character_end_times_seconds?.[index] ?? characterStart);
    if (/\s/.test(character)) {
      if (word) {
        words.push({ word, start: Number(start.toFixed(3)), end: Number(end.toFixed(3)) });
        word = "";
        start = null;
        end = null;
      }
      return;
    }
    if (start === null) start = characterStart;
    end = characterEnd;
    word += character;
  });

  if (word) words.push({ word, start: Number(start.toFixed(3)), end: Number(end.toFixed(3)) });
  return words;
}

function buildApproximateWordTimestamps(text, durationSeconds) {
  if (!durationSeconds || durationSeconds <= 0) return [];
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const weights = words.map((word) => Math.max(1, word.replace(/[^\p{L}\p{N}]/gu, "").length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;

  return words.map((word, index) => {
    const start = cursor;
    cursor += durationSeconds * (weights[index] / totalWeight);
    return {
      word,
      start: Number(start.toFixed(3)),
      end: Number(cursor.toFixed(3)),
    };
  });
}

function readWavDurationSeconds(buffer) {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    return null;
  }

  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);
  if (!channels || !sampleRate || !bitsPerSample) return null;

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      const bytesPerSample = bitsPerSample / 8;
      if (!bytesPerSample) return null;
      return Number((chunkSize / (sampleRate * channels * bytesPerSample)).toFixed(3));
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  return null;
}

async function convertWavToMp3({ wavPath, mp3Path, ffmpegPath }) {
  await execFileAsync(ffmpegPath, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    wavPath,
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "128k",
    mp3Path,
  ]);
}

export function getNarrationFilePath(projectId, sceneId) {
  return path.join(AUDIO_ROOT, projectId, "scenes", `${sceneId}.mp3`);
}

export async function narrationFileExists(projectId, sceneId) {
  try {
    await access(getNarrationFilePath(projectId, sceneId));
    return true;
  } catch {
    return false;
  }
}

async function persistElevenLabsAudio({ projectId, sceneId, payload }) {
  if (!payload.audio_base64) throw new Error("TTS provider returned no audio.");

  const filePath = getNarrationFilePath(projectId, sceneId);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(payload.audio_base64, "base64"));

  if (!(await narrationFileExists(projectId, sceneId))) {
    throw new Error("TTS generation completed but the narration file could not be verified on disk.");
  }

  const alignment = payload.alignment || payload.normalized_alignment;
  return {
    provider: "elevenlabs",
    fallback: false,
    voiceId: payload.voiceId,
    audioUrl: `/api/audio/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}.mp3`,
    wordTimestamps: buildWordTimestamps(alignment),
    durationSeconds: alignment?.character_end_times_seconds?.length
      ? Number(alignment.character_end_times_seconds.at(-1).toFixed(3))
      : null,
  };
}

async function persistQwenAudio({ projectId, sceneId, text, audio, voice, wordTimestamps, durationSeconds, timingMethod }) {
  const filePath = getNarrationFilePath(projectId, sceneId);
  await mkdir(path.dirname(filePath), { recursive: true });

  const tempWavPath = path.join(path.dirname(filePath), `.${sceneId}.${randomUUID()}.qwen.wav`);
  const tempMp3Path = path.join(path.dirname(filePath), `.${sceneId}.${randomUUID()}.qwen.mp3`);
  const backupPath = path.join(path.dirname(filePath), `.${sceneId}.${randomUUID()}.previous.mp3`);
  let backedUpExisting = false;
  try {
    await writeFile(tempWavPath, audio);
    const measuredDuration = readWavDurationSeconds(audio);
    const finalDuration = durationSeconds ?? measuredDuration;
    const { ffmpegPath } = requireConfig();
    await convertWavToMp3({ wavPath: tempWavPath, mp3Path: tempMp3Path, ffmpegPath });

    try {
      await rename(filePath, backupPath);
      backedUpExisting = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await rename(tempMp3Path, filePath);
    if (backedUpExisting) await rm(backupPath, { force: true });

    if (!(await narrationFileExists(projectId, sceneId))) {
      throw new Error("Qwen3-TTS generated audio but the narration file could not be verified on disk.");
    }

    const timestamps = Array.isArray(wordTimestamps) && wordTimestamps.length
      ? wordTimestamps
      : buildApproximateWordTimestamps(text, finalDuration);

    return {
      provider: "qwen3-tts",
      fallback: true,
      voiceId: voice,
      audioUrl: `/api/audio/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}.mp3`,
      wordTimestamps: timestamps,
      durationSeconds: finalDuration,
      timingMethod: timingMethod || (wordTimestamps?.length ? "qwen-audio-alignment" : "proportional"),
    };
  } catch (error) {
    if (backedUpExisting) {
      await rename(backupPath, filePath).catch(() => {});
    }
    throw error;
  } finally {
    await rm(tempWavPath, { force: true }).catch(() => {});
    await rm(tempMp3Path, { force: true }).catch(() => {});
    await rm(backupPath, { force: true }).catch(() => {});
  }
}

async function generateElevenLabsNarration({ projectId, sceneId, text }) {
  const { apiKey, voiceId: configuredVoiceId, modelId } = requireConfig();
  if (!apiKey) throw new Error("ElevenLabs is not configured.");

  let selectedVoiceId = configuredVoiceId || await findAvailableVoice(apiKey);
  let payload;
  try {
    payload = await requestSpeech({ apiKey, voiceId: selectedVoiceId, modelId, text });
  } catch (error) {
    if (!isRestrictedLibraryVoiceError(error.message)) throw error;
    selectedVoiceId = await findAvailableVoice(apiKey);
    payload = await requestSpeech({ apiKey, voiceId: selectedVoiceId, modelId, text });
  }

  const result = await persistElevenLabsAudio({ projectId, sceneId, payload });
  return { ...result, voiceId: selectedVoiceId };
}

async function generateQwenNarration({ projectId, sceneId, text, language, voice, instruct }) {
  const qwen = await synthesizeWithQwen({ text, language, voice, instruct });
  return persistQwenAudio({
    projectId,
    sceneId,
    text,
    audio: qwen.audio,
    voice: qwen.voice,
    wordTimestamps: qwen.wordTimestamps,
    durationSeconds: qwen.durationSeconds,
    timingMethod: qwen.timingMethod,
  });
}

export async function synthesizeSpeech(
  { projectId, sceneId, text, language, voice, instruct },
  adapters = {},
) {
  const cleanText = String(text || "").trim();
  if (!cleanText) throw new Error("Cannot synthesize an empty scene.");

  const elevenLabs = adapters.elevenLabs || generateElevenLabsNarration;
  const qwen = adapters.qwen || generateQwenNarration;
  let elevenLabsError = null;

  try {
    return await elevenLabs({ projectId, sceneId, text: cleanText, language, voice, instruct });
  } catch (error) {
    elevenLabsError = error;
    console.warn("TTS provider failed", {
      provider: "elevenlabs",
      status: error?.providerStatus ?? null,
      message: error?.message || String(error),
      qwenFallbackEnabled: isQwen3TtsEnabled(),
      projectId,
      sceneId,
    });
  }

  if (isQwen3TtsEnabled()) {
    try {
      const result = await qwen({ projectId, sceneId, text: cleanText, language, voice, instruct });
      console.info("TTS fallback succeeded", {
        primaryProvider: "elevenlabs",
        fallbackProvider: result?.provider || "qwen3-tts",
        timingMethod: result?.timingMethod || "unknown",
        projectId,
        sceneId,
      });
      return result;
    } catch (error) {
      console.error("TTS fallback failed", {
        provider: "qwen3-tts",
        status: error?.providerStatus ?? null,
        message: error?.message || String(error),
        projectId,
        sceneId,
      });
      throw new Error(`TTS generation failed. ElevenLabs: ${elevenLabsError?.message || "not attempted"}. Qwen3-TTS: ${error.message}`);
    }
  }

  throw new Error(`TTS generation failed: ${elevenLabsError?.message || "ElevenLabs is not configured and Qwen3-TTS fallback is disabled."}`);
}

export async function getTtsDiagnostics() {
  const { apiKey, voiceId, modelId } = requireConfig();
  const qwen = await checkQwen3TtsHealth();
  return {
    providerOrder: ["elevenlabs", "qwen3-tts"],
    elevenLabs: {
      configured: Boolean(apiKey),
      voiceConfigured: Boolean(voiceId),
      model: modelId,
    },
    qwen3Tts: qwen,
  };
}
