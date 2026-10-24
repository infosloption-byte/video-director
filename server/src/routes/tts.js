import { Router } from "express";

// Historical raw TTS passthrough endpoints did not enforce voice ownership,
// and allowed access to every voice stored on the shared inference gateway.
// Voxora now uses /api/voice-profiles (user-scoped) for all voice management.
const router = Router();
function retiredVoiceProxy(_req, res) {
  return res.status(410).json({
    code: "DIRECT_TTS_VOICE_API_RETIRED",
    error: "Direct TTS voice access is no longer supported. Use the authenticated Voice Profiles workspace."
  });
}
router.all("/tts/voices", retiredVoiceProxy);
router.all("/tts/voices/:voiceId", retiredVoiceProxy);

export default router;
