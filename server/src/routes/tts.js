import { Router } from "express";

const router = Router();

function config() {
  return {
    baseUrl: process.env.TTS_SERVICE_URL?.trim().replace(/\/+$/, "") || null,
    authToken: process.env.TTS_SERVICE_AUTH_TOKEN?.trim() || null,
    timeoutMs: Number.parseInt(process.env.TTS_SERVICE_TIMEOUT_MS || "180000", 10),
  };
}

function headers(authToken, json = true) {
  return {
    Accept: "application/json",
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(authToken ? { Authorization: "Bearer " + authToken } : {}),
  };
}

async function request(url, options = {}) {
  const { timeoutMs } = config();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function requireService() {
  const { baseUrl } = config();
  if (!baseUrl) {
    const error = new Error("TTS_SERVICE_URL is not configured.");
    error.status = 503;
    throw error;
  }
  return baseUrl;
}

router.get("/tts/voices", async (_req, res) => {
  try {
    const baseUrl = requireService();
    const { authToken } = config();
    const response = await request(baseUrl + "/v1/voices", {
      headers: headers(authToken, false),
    });
    const payload = await response.json().catch(() => ({}));
    res.status(response.status).json(payload);
  } catch (error) {
    res.status(error.status || 503).json({
      error: error.message || "TTS voice service unavailable.",
    });
  }
});

router.post("/tts/voices", async (req, res) => {
  try {
    const baseUrl = requireService();
    const { authToken } = config();
    const {
      name,
      referenceAudioBase64,
      referenceText = "",
      preferredEngine = "chatterbox-nano",
      fileName = "reference.wav",
    } = req.body || {};

    if (!name || !referenceAudioBase64) {
      return res.status(400).json({
        error: "name and referenceAudioBase64 are required.",
      });
    }

    const encoded = String(referenceAudioBase64).replace(
      /^data:[^;]+;base64,/,
      "",
    );
    const audio = Buffer.from(encoded, "base64");
    if (!audio.length) {
      return res.status(400).json({ error: "Reference audio is empty." });
    }
    if (audio.length > 25 * 1024 * 1024) {
      return res.status(413).json({
        error: "Reference audio exceeds the 25 MB limit.",
      });
    }

    const form = new FormData();
    form.append("name", String(name));
    form.append("reference_text", String(referenceText || ""));
    form.append("preferred_engine", String(preferredEngine));
    form.append(
      "reference_audio",
      new Blob([audio]),
      String(fileName || "reference.wav"),
    );

    const response = await request(baseUrl + "/v1/voices", {
      method: "POST",
      headers: headers(authToken, false),
      body: form,
    });
    const payload = await response.json().catch(() => ({}));
    return res.status(response.status).json(payload);
  } catch (error) {
    return res.status(error.status || 503).json({
      error: error.message || "Failed to create TTS voice.",
    });
  }
});

router.get("/tts/voices/:voiceId", async (req, res) => {
  try {
    const baseUrl = requireService();
    const { authToken } = config();
    const response = await request(
      baseUrl + "/v1/voices/" + encodeURIComponent(req.params.voiceId),
      { headers: headers(authToken, false) },
    );
    const payload = await response.json().catch(() => ({}));
    res.status(response.status).json(payload);
  } catch (error) {
    res.status(error.status || 503).json({
      error: error.message || "TTS voice service unavailable.",
    });
  }
});

router.delete("/tts/voices/:voiceId", async (req, res) => {
  try {
    const baseUrl = requireService();
    const { authToken } = config();
    const response = await request(
      baseUrl + "/v1/voices/" + encodeURIComponent(req.params.voiceId),
      {
        method: "DELETE",
        headers: headers(authToken, false),
      },
    );
    const payload = await response.json().catch(() => ({}));
    res.status(response.status).json(payload);
  } catch (error) {
    res.status(error.status || 503).json({
      error: error.message || "TTS voice service unavailable.",
    });
  }
});

export default router;
