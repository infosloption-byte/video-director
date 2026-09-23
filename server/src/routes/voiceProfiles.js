import { Router } from "express";
import { readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/client.js";
import { createTtsVoiceFromFile, deleteTtsVoice } from "../services/ttsService.js";
import { buildCombinedReference, deleteVoiceProfileFiles, getVoiceProfileSamplePath, saveVoiceProfileSample, MAX_SAMPLES, MIN_SAMPLES, MAX_SAMPLE_BYTES } from "../services/voiceProfileService.js";

const router = Router();
const SUPPORTED_ENGINES = new Set(["qwen3-tts-0.6b", "chatterbox-nano"]);
const DEFAULT_PROMPTS = [
  "Today we are going to break down a simple idea and show why it matters.",
  "The most useful way to understand this change is to look at what happens step by step.",
  "There is a practical reason this works, and the evidence becomes clearer when we slow down and look closely.",
  "A good explanation does not rush the important part; it gives each sentence enough room to land naturally.",
  "The goal is not to sound perfect. The goal is to sound like yourself, clearly and consistently.",
  "Now let us connect the pieces and turn the explanation into something practical and easy to remember."
];

function publicProfile(profile) {
  return {
    id: profile.id, name: profile.name, language: profile.language, preferredEngine: profile.preferredEngine,
    status: profile.status, ttsVoiceId: profile.ttsVoiceId, sampleCount: profile.sampleCount,
    consentAccepted: Boolean(profile.consentAcceptedAt), createdAt: profile.createdAt, updatedAt: profile.updatedAt,
    samples: (profile.samples || []).map((sample) => ({
      id: sample.id, sampleIndex: sample.sampleIndex, promptText: sample.promptText,
      filename: sample.filename, mimeType: sample.mimeType,
      sizeBytes: sample.sizeBytes == null ? null : Number(sample.sizeBytes),
      durationSeconds: sample.durationSeconds == null ? null : Number(sample.durationSeconds),
      status: sample.status, createdAt: sample.createdAt, updatedAt: sample.updatedAt,
      audioUrl: "/api/voice-profiles/" + profile.id + "/samples/" + sample.id
    }))
  };
}

function decodeAudio(value) {
  const raw = String(value || "");
  const match = raw.match(/^data:([^;,]+);base64,/i);
  const mimeType = match?.[1] || "audio/webm";
  const encoded = raw.replace(/^data:[^;]+;base64,/i, "");
  return { mimeType, audio: Buffer.from(encoded, "base64") };
}

async function ownedProfile(userId, id) {
  return prisma.voiceProfile.findFirst({ where: { id, userId }, include: { samples: { orderBy: { sampleIndex: "asc" } } } });
}

router.get("/", async (req, res) => {
  try {
    const profiles = await prisma.voiceProfile.findMany({
      where: { userId: req.user.id, status: { not: "archived" } },
      orderBy: { updatedAt: "desc" },
      include: { samples: { orderBy: { sampleIndex: "asc" } } }
    });
    res.json({ profiles: profiles.map(publicProfile), prompts: DEFAULT_PROMPTS, minSamples: MIN_SAMPLES, maxSamples: MAX_SAMPLES });
  } catch (error) {
    console.error("GET /api/voice-profiles failed:", error);
    res.status(500).json({ error: error.message || "Failed to load voice profiles." });
  }
});

router.post("/", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const language = String(req.body?.language || "English").trim().slice(0, 40) || "English";
    const preferredEngine = String(req.body?.preferredEngine || "qwen3-tts-0.6b").trim();
    if (!name) return res.status(400).json({ error: "Voice profile name is required." });
    if (!SUPPORTED_ENGINES.has(preferredEngine)) return res.status(400).json({ error: "Choose Qwen3-TTS 0.6B or Chatterbox-Nano." });
    if (req.body?.consentAccepted !== true) return res.status(400).json({ error: "Confirm that you own or have permission to use these recordings." });
    const profile = await prisma.voiceProfile.create({
      data: { userId: req.user.id, name: name.slice(0, 120), language, preferredEngine, consentAcceptedAt: new Date() },
      include: { samples: true }
    });
    res.status(201).json(publicProfile(profile));
  } catch (error) {
    console.error("POST /api/voice-profiles failed:", error);
    res.status(500).json({ error: error.message || "Failed to create voice profile." });
  }
});

router.get("/:id", async (req, res) => {
  const profile = await ownedProfile(req.user.id, req.params.id);
  if (!profile) return res.status(404).json({ error: "Voice profile not found." });
  return res.json(publicProfile(profile));
});

router.post("/:id/samples", async (req, res) => {
  try {
    const profile = await ownedProfile(req.user.id, req.params.id);
    if (!profile) return res.status(404).json({ error: "Voice profile not found." });
    const sampleIndex = Number(req.body?.sampleIndex);
    if (!Number.isInteger(sampleIndex) || sampleIndex < 0 || sampleIndex >= MAX_SAMPLES) return res.status(400).json({ error: "sampleIndex must be between 0 and " + (MAX_SAMPLES - 1) + "." });
    const promptText = String(req.body?.promptText || "").trim();
    if (!promptText) return res.status(400).json({ error: "promptText is required." });
    const { mimeType, audio } = decodeAudio(req.body?.audioBase64);
    if (!audio.length) return res.status(400).json({ error: "Recording is empty." });
    if (audio.length > MAX_SAMPLE_BYTES) return res.status(413).json({ error: "Each recording must be 8 MB or smaller." });

    const existing = profile.samples.find((sample) => sample.sampleIndex === sampleIndex);
    if (existing) await rm(getVoiceProfileSamplePath(existing.storageKey), { force: true }).catch(() => {});
    const sampleId = existing?.id || randomUUID();
    const saved = await saveVoiceProfileSample({ profileId: profile.id, sampleId, promptText, audio, mimeType, filename: String(req.body?.filename || ("voice-sample-" + (sampleIndex + 1))) });

    if (existing) {
      await prisma.voiceProfileSample.update({ where: { id: existing.id }, data: { promptText, storageKey: saved.storageKey, filename: String(req.body?.filename || ("voice-sample-" + (sampleIndex + 1))), mimeType, sizeBytes: BigInt(audio.length), status: "ready" } });
    } else {
      await prisma.voiceProfileSample.create({ data: { profileId: profile.id, sampleIndex, promptText, storageKey: saved.storageKey, filename: String(req.body?.filename || ("voice-sample-" + (sampleIndex + 1))), mimeType, sizeBytes: BigInt(audio.length), status: "ready" } });
    }

    if (profile.ttsVoiceId) await deleteTtsVoice(profile.ttsVoiceId).catch((error) => console.warn("[voice-profile] failed to delete remote voice:", error.message));

    const updated = await prisma.voiceProfile.update({
      where: { id: profile.id },
      data: { status: "draft", ttsVoiceId: null, sampleCount: await prisma.voiceProfileSample.count({ where: { profileId: profile.id } }) },
      include: { samples: { orderBy: { sampleIndex: "asc" } } }
    });
    return res.status(201).json({ profile: publicProfile(updated), sample: publicProfile(updated).samples.find((item) => item.sampleIndex === sampleIndex) });
  } catch (error) {
    console.error("POST /api/voice-profiles/" + req.params.id + "/samples failed:", error);
    res.status(500).json({ error: error.message || "Failed to save recording." });
  }
});

router.get("/:id/samples/:sampleId", async (req, res) => {
  const profile = await ownedProfile(req.user.id, req.params.id);
  if (!profile) return res.status(404).json({ error: "Voice profile not found." });
  const sample = profile.samples.find((item) => item.id === req.params.sampleId);
  if (!sample) return res.status(404).json({ error: "Recording not found." });
  try {
    const filePath = getVoiceProfileSamplePath(sample.storageKey);
    await readFile(filePath);
    if (sample.mimeType) res.type(sample.mimeType);
    return res.sendFile(filePath);
  } catch {
    return res.status(404).json({ error: "Recording file not found." });
  }
});

router.post("/:id/clone", async (req, res) => {
  let combinedPath = null;
  try {
    const profile = await ownedProfile(req.user.id, req.params.id);
    if (!profile) return res.status(404).json({ error: "Voice profile not found." });
    if (!profile.consentAcceptedAt) return res.status(400).json({ error: "Voice-use consent is required before cloning." });
    if (profile.samples.length < MIN_SAMPLES) return res.status(409).json({ error: "Record at least " + MIN_SAMPLES + " samples before creating the voice profile." });
    if (profile.status === "processing") return res.status(409).json({ error: "Voice profile cloning is already running." });

    await prisma.voiceProfile.update({ where: { id: profile.id }, data: { status: "processing", sampleCount: profile.samples.length } });
    combinedPath = await buildCombinedReference(profile.samples, profile.id);
    const referenceText = profile.samples.map((sample) => sample.promptText).join("\n");
    const created = await createTtsVoiceFromFile({ name: profile.name, referenceAudioPath: combinedPath, referenceText, preferredEngine: profile.preferredEngine });
    await prisma.voiceProfile.update({ where: { id: profile.id }, data: { status: "ready", ttsVoiceId: created.voice_id, sampleCount: profile.samples.length, referenceText } });
    const ready = await ownedProfile(req.user.id, profile.id);
    return res.status(201).json({ profile: publicProfile(ready), provider: created });
  } catch (error) {
    console.error("POST /api/voice-profiles/" + req.params.id + "/clone failed:", error);
    await prisma.voiceProfile.update({ where: { id: req.params.id }, data: { status: "failed" } }).catch(() => {});
    res.status(error?.providerStatus === 429 ? 429 : 500).json({ error: error.message || "Failed to create voice clone." });
  } finally {
    if (combinedPath) await rm(combinedPath, { force: true }).catch(() => {});
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const profile = await ownedProfile(req.user.id, req.params.id);
    if (!profile) return res.status(404).json({ error: "Voice profile not found." });
    if (profile.ttsVoiceId) await deleteTtsVoice(profile.ttsVoiceId).catch((error) => console.warn("[voice-profile] failed to delete remote voice:", error.message));
    await prisma.voiceProfile.delete({ where: { id: profile.id } });
    await deleteVoiceProfileFiles(profile.id);
    return res.status(204).end();
  } catch (error) {
    console.error("DELETE /api/voice-profiles/" + req.params.id + " failed:", error);
    res.status(500).json({ error: error.message || "Failed to delete voice profile." });
  }
});

export default router;
