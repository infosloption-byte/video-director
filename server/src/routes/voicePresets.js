import { Router } from "express";
import { getPredefinedVoice, getPredefinedVoices, getPredefinedVoiceFilters, PREDEFINED_VOICE_PREVIEW_TEXT } from "../services/predefinedVoiceService.js";
import { synthesizeVoicePreview } from "../services/ttsService.js";

const router = Router();

router.get("/", (_req, res) => {
  res.json({
    voices: getPredefinedVoices(),
    filters: getPredefinedVoiceFilters(),
  });
});

router.post("/:id/preview", async (req, res) => {
  try {
    const voice = getPredefinedVoice(req.params.id);
    if (!voice) return res.status(404).json({ error: "Predefined voice not found." });

    const text = String(req.body?.text || PREDEFINED_VOICE_PREVIEW_TEXT).trim().slice(0, 500);
    const preview = await synthesizeVoicePreview({
      text,
      engine: voice.engine,
      voice: voice.voice,
      language: voice.language,
    });

    return res.json({
      id: voice.id,
      text,
      ...preview,
    });
  } catch (error) {
    console.error("POST /api/voice-presets/" + req.params.id + "/preview failed:", error);
    return res.status(error?.providerStatus === 429 ? 429 : 500).json({
      error: error.message || "Failed to generate predefined voice preview.",
    });
  }
});

export default router;
