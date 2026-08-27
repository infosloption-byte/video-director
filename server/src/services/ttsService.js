import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const AUDIO_ROOT = path.resolve(process.cwd(), "storage", "audio");
const DEFAULT_MODEL = "eleven_multilingual_v2";

function requireConfig() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("TTS is not configured. Set ELEVENLABS_API_KEY in server/.env.");
  }
  return {
    apiKey,
    voiceId: process.env.ELEVENLABS_VOICE_ID?.trim() || null,
    modelId: process.env.ELEVENLABS_MODEL || DEFAULT_MODEL,
  };
}

async function findAvailableVoice(apiKey) {
  const response = await fetch("https://api.elevenlabs.io/v1/voices?voice_type=non-community&page_size=100", {
    headers: { "xi-api-key": apiKey, Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Unable to list ElevenLabs voices (HTTP ${response.status}).`);

  const voices = Array.isArray(payload.voices) ? payload.voices : [];
  const eligible = voices.find((voice) => {
    const tiers = Array.isArray(voice.available_for_tiers) ? voice.available_for_tiers.map((tier) => String(tier).toLowerCase()) : [];
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

export async function synthesizeSpeech({ projectId, sceneId, text }) {
  const { apiKey, voiceId: configuredVoiceId, modelId } = requireConfig();
  const cleanText = String(text || "").trim();
  if (!cleanText) throw new Error("Cannot synthesize an empty scene.");

  let voiceId = configuredVoiceId || await findAvailableVoice(apiKey);
  let payload;

  try {
    payload = await requestSpeech({ apiKey, voiceId, modelId, text: cleanText });
  } catch (error) {
    if (!isRestrictedLibraryVoiceError(error.message)) throw new Error(`TTS generation failed: ${error.message}`);
    voiceId = await findAvailableVoice(apiKey);
    try {
      payload = await requestSpeech({ apiKey, voiceId, modelId, text: cleanText });
    } catch (retryError) {
      throw new Error(`TTS generation failed: ${retryError.message}`);
    }
  }

  if (!payload.audio_base64) throw new Error("TTS provider returned no audio.");

  const filePath = getNarrationFilePath(projectId, sceneId);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(payload.audio_base64, "base64"));

  if (!(await narrationFileExists(projectId, sceneId))) {
    throw new Error("TTS generation completed but the narration file could not be verified on disk.");
  }

  const alignment = payload.alignment || payload.normalized_alignment;
  return {
    voiceId,
    // Express serves storage/audio as /api/audio, so this URL maps exactly
    // to storage/audio/<projectId>/scenes/<sceneId>.mp3.
    audioUrl: `/api/audio/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}.mp3`,
    wordTimestamps: buildWordTimestamps(alignment),
    durationSeconds: alignment?.character_end_times_seconds?.length
      ? Number(alignment.character_end_times_seconds.at(-1).toFixed(3))
      : null,
  };
}
