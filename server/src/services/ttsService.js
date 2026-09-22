import { access, mkdir, writeFile, rm, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const AUDIO_ROOT = path.resolve(process.cwd(), "storage", "audio");

function requireConfig() {
  return {
    baseUrl: process.env.TTS_SERVICE_URL?.trim().replace(/\/+$/, "") || null,
    authToken: process.env.TTS_SERVICE_AUTH_TOKEN?.trim() || null,
    timeoutMs: Number.parseInt(process.env.TTS_SERVICE_TIMEOUT_MS || "180000", 10),
    defaultEngine: process.env.TTS_DEFAULT_ENGINE?.trim() || "kokoro",
    defaultVoiceId: process.env.TTS_DEFAULT_VOICE_ID?.trim() || null,
    defaultLanguage: process.env.TTS_DEFAULT_LANGUAGE?.trim() || "English",
    ffmpegPath: process.env.FFMPEG_PATH?.trim() || "ffmpeg",
  };
}

function buildHeaders(authToken) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: "Bearer " + authToken } : {}),
  };
}

async function requestJson(url, options = {}, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestSpeech({ text, engine, voiceId, language, instruct, speed, allowFallback }) {
  const {
    baseUrl,
    authToken,
    timeoutMs,
    defaultEngine,
    defaultVoiceId,
    defaultLanguage,
  } = requireConfig();

  if (!baseUrl) throw new Error("TTS_SERVICE_URL is not configured.");

  const response = await requestJson(
    baseUrl + "/v1/audio/speech",
    {
      method: "POST",
      headers: buildHeaders(authToken),
      body: JSON.stringify({
        text,
        engine: engine || defaultEngine,
        voice_id: voiceId || defaultVoiceId,
        language: language || defaultLanguage,
        instruct: instruct || null,
        speed: speed ?? 1,
        allow_fallback: allowFallback !== false,
      }),
    },
    timeoutMs,
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.detail;
    const detailText = typeof detail === "string"
      ? detail
      : detail?.message || JSON.stringify(detail || payload || ("TTS service returned HTTP " + response.status + "."));
    const error = new Error(String(detailText));
    error.providerStatus = response.status;
    throw error;
  }

  return payload;
}

function buildApproximateWordTimestamps(text, durationSeconds) {
  if (!durationSeconds || durationSeconds <= 0) return [];
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const weights = words.map((word) => Math.max(
    1,
    word.replace(/[^\p{L}\p{N}]/gu, "").length,
  ));
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
  if (
    buffer.length < 44 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  ) return null;

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
  return path.join(AUDIO_ROOT, projectId, "scenes", sceneId + ".mp3");
}

export async function narrationFileExists(projectId, sceneId) {
  try {
    await access(getNarrationFilePath(projectId, sceneId));
    return true;
  } catch {
    return false;
  }
}

async function persistTtsAudio({ projectId, sceneId, text, payload }) {
  if (!payload?.audio_base64) throw new Error("TTS service returned no audio.");

  const filePath = getNarrationFilePath(projectId, sceneId);
  await mkdir(path.dirname(filePath), { recursive: true });

  const directory = path.dirname(filePath);
  const tempWavPath = path.join(directory, "." + sceneId + "." + randomUUID() + ".tts.wav");
  const tempMp3Path = path.join(directory, "." + sceneId + "." + randomUUID() + ".tts.mp3");
  const backupPath = path.join(directory, "." + sceneId + "." + randomUUID() + ".previous.mp3");
  let backedUpExisting = false;

  try {
    const audio = Buffer.from(payload.audio_base64, "base64");
    await writeFile(tempWavPath, audio);

    const measuredDuration = readWavDurationSeconds(audio);
    const finalDuration = payload.duration_seconds ?? measuredDuration;
    const { ffmpegPath } = requireConfig();

    await convertWavToMp3({
      wavPath: tempWavPath,
      mp3Path: tempMp3Path,
      ffmpegPath,
    });

    try {
      await rename(filePath, backupPath);
      backedUpExisting = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    await rename(tempMp3Path, filePath);
    if (backedUpExisting) await rm(backupPath, { force: true });

    if (!(await narrationFileExists(projectId, sceneId))) {
      throw new Error("TTS generated audio but the narration file could not be verified on disk.");
    }

    const wordTimestamps = Array.isArray(payload.word_timestamps) && payload.word_timestamps.length
      ? payload.word_timestamps
      : buildApproximateWordTimestamps(text, finalDuration);

    return {
      provider: payload.engine || "self-hosted-tts",
      engine: payload.engine || null,
      requestedEngine: payload.requested_engine || payload.engine || null,
      fallback: Boolean(payload.fallback),
      voiceId: payload.voice_id || null,
      audioUrl: "/api/audio/" + encodeURIComponent(projectId) + "/scenes/" + encodeURIComponent(sceneId) + ".mp3",
      wordTimestamps,
      durationSeconds: finalDuration,
      timingMethod: payload.timing_method || (
        payload.word_timestamps?.length ? "provider" : "proportional"
      ),
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

async function generateRemoteNarration(params) {
  const payload = await requestSpeech(params);
  return persistTtsAudio({
    projectId: params.projectId,
    sceneId: params.sceneId,
    text: params.text,
    payload,
  });
}

export async function synthesizeSpeech(
  { projectId, sceneId, text, engine, voiceId, language, instruct, speed, allowFallback },
  adapters = {},
) {
  const cleanText = String(text || "").trim();
  if (!cleanText) throw new Error("Cannot synthesize an empty scene.");

  const remoteTts = adapters.remoteTts || generateRemoteNarration;
  try {
    return await remoteTts({
      projectId,
      sceneId,
      text: cleanText,
      engine,
      voiceId,
      language,
      instruct,
      speed,
      allowFallback,
    });
  } catch (error) {
    console.error("Self-hosted TTS generation failed", {
      provider: "helix-tts",
      status: error?.providerStatus ?? null,
      message: error?.message || String(error),
      projectId,
      sceneId,
      engine: engine || requireConfig().defaultEngine,
    });
    throw error;
  }
}

export async function getTtsDiagnostics() {
  const {
    baseUrl,
    authToken,
    timeoutMs,
    defaultEngine,
    defaultVoiceId,
    defaultLanguage,
  } = requireConfig();

  if (!baseUrl) {
    return {
      configured: false,
      reachable: false,
      providerOrder: [
        "kokoro",
        "melotts-v3",
        "chatterbox-nano",
        "qwen3-tts-0.6b",
      ],
      defaultEngine,
      defaultVoiceIdConfigured: Boolean(defaultVoiceId),
      defaultLanguage,
      error: "TTS_SERVICE_URL is not configured.",
    };
  }

  try {
    const response = await requestJson(
      baseUrl + "/diagnostics",
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(authToken ? { Authorization: "Bearer " + authToken } : {}),
        },
      },
      Math.min(timeoutMs, 10000),
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        configured: true,
        reachable: false,
        providerOrder: [
          "kokoro",
          "melotts-v3",
          "chatterbox-nano",
          "qwen3-tts-0.6b",
        ],
        defaultEngine,
        defaultVoiceIdConfigured: Boolean(defaultVoiceId),
        defaultLanguage,
        error: payload?.detail || ("TTS service returned HTTP " + response.status + "."),
      };
    }

    return {
      configured: true,
      reachable: true,
      baseUrl,
      defaultEngine,
      defaultVoiceIdConfigured: Boolean(defaultVoiceId),
      defaultLanguage,
      ...payload,
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      providerOrder: [
        "kokoro",
        "melotts-v3",
        "chatterbox-nano",
        "qwen3-tts-0.6b",
      ],
      defaultEngine,
      defaultVoiceIdConfigured: Boolean(defaultVoiceId),
      defaultLanguage,
      error: error?.name === "AbortError"
        ? "TTS service health check timed out."
        : error.message,
    };
  }
}
