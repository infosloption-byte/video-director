import { access, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { synthesizeWithQwen, isQwen3TtsEnabled } from "./qwenTtsService.js";

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
  if (!response.ok) throw new Error(`Unable to list ElevenLabs voices (HTTP ${response.status}).`);

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

async function persistQwenAudio({ projectId, sceneId, text, audio, voice }) {
  const filePath = getNarrationFilePath(projectId, sceneId);
  await mkdir(path.dirname(filePath), { recursive: true });

  const tempWavPath = path.join(path.dirname(filePath), `.${sceneId}.${randomUUID()}.qwen.wav`);
  const tempMp3Path = path.join(path.dirname(filePath), `.${sceneId}.${randomUUID()}.qwen.mp3`);
  try {
    await writeFile(tempWavPath, audio);
    const durationSeconds = readWavDurationSeconds(audio);
    const { ffmpegPath } = requireConfig();
    await convertWavToMp3({ wavPath: tempWavPath, mp3Path: tempMp3Path, ffmpegPath });
    await rm(filePath, { force: true });
    await rm(tempWavPath, { force: true });
    await execFileAsync(ffmpegPath, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      tempMp3Path,
      "-codec",
      "copy",
      filePath,
    ]);
    await rm(tempMp3Path, { force: true });

    if (!(await narrationFileExists(projectId, sceneId))) {
      throw new Error("Qwen3-TTS generated audio but the narration file could not be verified on disk.");
    }

    return {
      provider: "qwen3-tts",
      fallback: true,
      voiceId: voice,
      audioUrl: `/api/audio/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}.mp3`,
      wordTimestamps: buildApproximateWordTimestamps(text, durationSeconds),
      durationSeconds,
    };
  } finally {
    await rm(tempWavPath, { force: true }).catch(() => {});
    await rm(tempMp3Path, { force: true }).catch(() => {});
  }
}

export async function synthesizeSpeech({ projectId, sceneId, text, language, voice, instruct }) {
  const cleanText = String(text || "").trim();
  if (!cleanText) throw new Error("Cannot synthesize an empty scene.");

  const { apiKey, voiceId: configuredVoiceId, modelId } = requireConfig();
  let elevenLabsError = null;

  if (apiKey) {
    try {
      let selectedVoiceId = configuredVoiceId || await findAvailableVoice(apiKey);
      let payload;

      try {
        payload = await requestSpeech({ apiKey, voiceId: selectedVoiceId, modelId, text: cleanText });
      } catch (error) {
        if (!isRestrictedLibraryVoiceError(error.message)) throw error;
        selectedVoiceId = await findAvailableVoice(apiKey);
        payload = await requestSpeech({ apiKey, voiceId: selectedVoiceId, modelId, text: cleanText });
      }

      const result = await persistElevenLabsAudio({ projectId, sceneId, payload });
      return { ...result, voiceId: selectedVoiceId };
    } catch (error) {
      elevenLabsError = error;
    }
  } else {
    elevenLabsError = new Error("ElevenLabs is not configured.");
  }

  if (isQwen3TtsEnabled()) {
    try {
      const qwen = await synthesizeWithQwen({
        text: cleanText,
        language,
        voice,
        instruct,
      });
      return await persistQwenAudio({
        projectId,
        sceneId,
        text: cleanText,
        audio: qwen.audio,
        voice: qwen.voice,
      });
    } catch (error) {
      throw new Error(`TTS generation failed. ElevenLabs: ${elevenLabsError?.message || "not attempted"}. Qwen3-TTS: ${error.message}`);
    }
  }

  throw new Error(`TTS generation failed: ${elevenLabsError?.message || "ElevenLabs is not configured and Qwen3-TTS fallback is disabled."}`);
}
