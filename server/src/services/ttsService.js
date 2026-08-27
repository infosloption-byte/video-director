import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const AUDIO_ROOT = path.resolve(process.cwd(), "storage", "audio");
const DEFAULT_MODEL = "eleven_multilingual_v2";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

function requireConfig() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("TTS is not configured. Set ELEVENLABS_API_KEY in server/.env.");
  }
  return {
    apiKey,
    voiceId: process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID,
    modelId: process.env.ELEVENLABS_MODEL || DEFAULT_MODEL,
  };
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

  if (word) {
    words.push({ word, start: Number(start.toFixed(3)), end: Number(end.toFixed(3)) });
  }

  return words;
}

export async function synthesizeSpeech({ projectId, sceneId, text }) {
  const { apiKey, voiceId, modelId } = requireConfig();
  const cleanText = String(text || "").trim();
  if (!cleanText) throw new Error("Cannot synthesize an empty scene.");

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      text: cleanText,
      model_id: modelId,
      output_format: "mp3_44100_128",
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.detail?.message || payload?.detail || `ElevenLabs returned HTTP ${response.status}.`;
    throw new Error(`TTS generation failed: ${detail}`);
  }
  if (!payload.audio_base64) throw new Error("TTS provider returned no audio.");

  const projectDir = path.join(AUDIO_ROOT, projectId);
  await mkdir(projectDir, { recursive: true });
  const filePath = path.join(projectDir, `${sceneId}.mp3`);
  await writeFile(filePath, Buffer.from(payload.audio_base64, "base64"));

  return {
    audioUrl: `/api/audio/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}.mp3`,
    wordTimestamps: buildWordTimestamps(payload.alignment || payload.normalized_alignment),
    durationSeconds: payload.alignment?.character_end_times_seconds?.length
      ? Number(payload.alignment.character_end_times_seconds.at(-1).toFixed(3))
      : null,
  };
}
